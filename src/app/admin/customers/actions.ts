"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/send";
import { courseAccessEmail } from "@/lib/email/templates";
import { env } from "@/lib/env";
import { formatDate } from "@/lib/format";
import { syncEmailContact } from "@/lib/email-list";

async function audit(actor: string, action: string, entityId: string, data?: object) {
  await createAdminClient().from("audit_log").insert({ actor_id: actor, action, entity: "enrollments", entity_id: entityId, data });
}

/** "2027-01-31" → end of that day; "" → lifetime */
function untilFrom(form: FormData): string | null {
  const v = String(form.get("until") ?? "").trim();
  if (!v || form.get("lifetime") === "on") return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new Error("Pick a valid date");
  return new Date(`${v}T23:59:59+04:00`).toISOString(); // end of that day, UAE time
}

/** Give a customer a course without payment (e.g. a scholarship, a support case, a corporate seat). */
export async function grantCourse(userId: string, form: FormData) {
  const admin = await requireRole(["admin", "support"]);
  const courseId = String(form.get("course_id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(courseId)) throw new Error("Choose a course");
  const until = untilFrom(form);
  const db = createAdminClient();
  const { error } = await db.from("enrollments").upsert(
    { user_id: userId, course_id: courseId, source: "admin", expires_at: until, revoked_at: null },
    { onConflict: "user_id,course_id" });
  if (error) throw new Error(error.message);
  await db.rpc("recompute_enrollment", { p_user: userId, p_course: courseId });
  await audit(admin.id, "enrollment.granted", `${userId}:${courseId}`, { until });
  if (form.get("notify") === "on") {
    const [{ data: p }, { data: c }] = await Promise.all([
      db.from("profiles").select("email, full_name").eq("id", userId).single(),
      db.from("courses").select("title, slug").eq("id", courseId).single(),
    ]);
    if (p?.email && c) {
      const m = courseAccessEmail({ name: p.full_name, course: c.title, url: `${env.siteUrl}/learn/${c.slug}`, until: until ? formatDate(until, "long") : null });
      await sendEmail({ to: p.email, ...m, template: "course_access", ref: `${userId}:${courseId}:${Date.now()}` });
    }
  }
  revalidatePath(`/admin/customers/${userId}`);
}

export async function setAccessUntil(userId: string, enrollmentId: string, form: FormData) {
  const admin = await requireRole(["admin", "support"]);
  const until = untilFrom(form);
  await createAdminClient().from("enrollments").update({ expires_at: until, revoked_at: null }).eq("id", enrollmentId).eq("user_id", userId);
  await audit(admin.id, "enrollment.access_changed", enrollmentId, { until });
  revalidatePath(`/admin/customers/${userId}`);
}

export async function removeAccess(userId: string, enrollmentId: string) {
  const admin = await requireRole(["admin", "support"]);
  await createAdminClient().from("enrollments").update({ revoked_at: new Date().toISOString() }).eq("id", enrollmentId).eq("user_id", userId);
  await audit(admin.id, "enrollment.revoked", enrollmentId);
  revalidatePath(`/admin/customers/${userId}`);
}

export async function restoreAccess(userId: string, enrollmentId: string) {
  const admin = await requireRole(["admin", "support"]);
  await createAdminClient().from("enrollments").update({ revoked_at: null }).eq("id", enrollmentId).eq("user_id", userId);
  await audit(admin.id, "enrollment.restored", enrollmentId);
  revalidatePath(`/admin/customers/${userId}`);
}

export async function updateStudentProfile(userId: string, form: FormData) {
  const admin = await requireRole(["admin", "support"]);
  const name = String(form.get("full_name") ?? "").trim().slice(0, 120);
  const country = String(form.get("country_code") ?? "").trim().toUpperCase();
  const patch: Record<string, unknown> = { full_name: name || null, country_code: /^[A-Z]{2}$/.test(country) ? country : null };
  // admins can only turn marketing emails OFF for someone (on request); opting in is the customer's own choice
  if (form.get("unsubscribe") === "on") patch.marketing_opt_in = false;
  await createAdminClient().from("profiles").update(patch).eq("id", userId);
  if (patch.marketing_opt_in === false) await syncEmailContact(userId).catch(() => "failed");
  await createAdminClient().from("audit_log").insert({ actor_id: admin.id, action: "profile.updated_by_staff", entity: "profiles", entity_id: userId, data: { fields: Object.keys(patch) } });
  revalidatePath(`/admin/customers/${userId}`);
}

/**
 * Admins give or take away team access (the "support" role): Customers, Orders, Leads, Marketing, and
 * Emails & updates, where the team drafts emails and submits them for an admin's approval.
 */
export async function setTeamAccess(userId: string, on: boolean) {
  const admin = await requireRole(["admin"]);
  if (userId === admin.id) return;
  const db = createAdminClient();
  if (on) await db.from("user_roles").upsert({ user_id: userId, role: "support" }, { onConflict: "user_id,role", ignoreDuplicates: true });
  else await db.from("user_roles").delete().eq("user_id", userId).eq("role", "support");
  await db.from("audit_log").insert({ actor_id: admin.id, action: on ? "role.support.granted" : "role.support.removed", entity: "profiles", entity_id: userId });
  revalidatePath(`/admin/customers/${userId}`);
}

/**
 * Why an account can't be deleted (empty = it can). Only stray or mistaken logins can go: anything with a purchase,
 * course access, credit, certificates, a review, an instructor or affiliate profile, or a team role must stay.
 */
export async function deleteBlockers(userId: string): Promise<string[]> {
  await requireRole(["admin"]);
  const db = createAdminClient();
  const count = async (table: string, col = "user_id") => (await db.from(table).select(col, { count: "exact", head: true }).eq(col, userId)).count ?? 0;
  const [{ data: roles }, { data: ins }, aff, orders, enr, certs, credit, reviews] = await Promise.all([
    db.from("user_roles").select("role").eq("user_id", userId),
    db.from("instructors").select("name").eq("user_id", userId),
    count("affiliates"), count("orders"), count("enrollments"), count("certificates"), count("credit_grants"), count("course_reviews"),
  ]);
  const out: string[] = [];
  const staff = (roles ?? []).map((r) => r.role).filter((r) => ["admin", "finance", "support"].includes(r));
  if (staff.length) out.push(`Has team access (${staff.join(", ")}). Remove team access first.`);
  for (const i of ins ?? []) out.push(`It is the login for the instructor profile "${i.name}". Link that profile to another email first (Admin → Instructors).`);
  if (aff) out.push("It has an affiliate profile.");
  if (orders) out.push(`It has ${orders} ${orders === 1 ? "order" : "orders"}.`);
  if (enr) out.push(`It has access to ${enr} ${enr === 1 ? "course" : "courses"} (current or past).`);
  if (certs) out.push("It has certificates.");
  if (credit) out.push("It has FinCoursa credit.");
  if (reviews) out.push("It has course reviews or feedback.");
  return out;
}

/** Permanently delete a mistaken login (admin only, after typing its email). Refuses anything with history. */
export async function deleteAccount(userId: string, form: FormData) {
  const admin = await requireRole(["admin"]);
  const back = (k: "ok" | "err", m: string, path = `/admin/customers/${userId}`) => redirect(`${path}?${k}=${encodeURIComponent(m)}#delete`);
  if (userId === admin.id) back("err", "You can't delete your own account.");
  const db = createAdminClient();
  const { data: p } = await db.from("profiles").select("email").eq("id", userId).maybeSingle();
  if (!p) back("err", "This account no longer exists.", "/admin/customers");
  const typed = String(form.get("confirm_email") ?? "").trim().toLowerCase();
  if (typed !== String(p!.email).toLowerCase()) back("err", "The email you typed doesn't match. Nothing was deleted.");
  const blockers = await deleteBlockers(userId);
  if (blockers.length) back("err", `Not deleted: ${blockers[0]}`);
  const { error } = await db.auth.admin.deleteUser(userId);
  if (error) back("err", `Not deleted: ${error.message}`);
  await db.from("audit_log").insert({ actor_id: admin.id, action: "account.deleted", entity: "profiles", entity_id: userId, data: { email: p!.email } });
  revalidatePath("/admin/customers");
  back("ok", `Deleted the account ${p!.email}.`, "/admin/customers");
}
