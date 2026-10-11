"use server";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/send";
import { courseAccessEmail } from "@/lib/email/templates";
import { env } from "@/lib/env";
import { formatDate } from "@/lib/format";

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

/** Give a student a course without payment (e.g. a scholarship, a support case, a corporate seat). */
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
  revalidatePath(`/admin/students/${userId}`);
}

export async function setAccessUntil(userId: string, enrollmentId: string, form: FormData) {
  const admin = await requireRole(["admin", "support"]);
  const until = untilFrom(form);
  await createAdminClient().from("enrollments").update({ expires_at: until, revoked_at: null }).eq("id", enrollmentId).eq("user_id", userId);
  await audit(admin.id, "enrollment.access_changed", enrollmentId, { until });
  revalidatePath(`/admin/students/${userId}`);
}

export async function removeAccess(userId: string, enrollmentId: string) {
  const admin = await requireRole(["admin", "support"]);
  await createAdminClient().from("enrollments").update({ revoked_at: new Date().toISOString() }).eq("id", enrollmentId).eq("user_id", userId);
  await audit(admin.id, "enrollment.revoked", enrollmentId);
  revalidatePath(`/admin/students/${userId}`);
}

export async function restoreAccess(userId: string, enrollmentId: string) {
  const admin = await requireRole(["admin", "support"]);
  await createAdminClient().from("enrollments").update({ revoked_at: null }).eq("id", enrollmentId).eq("user_id", userId);
  await audit(admin.id, "enrollment.restored", enrollmentId);
  revalidatePath(`/admin/students/${userId}`);
}

export async function updateStudentProfile(userId: string, form: FormData) {
  const admin = await requireRole(["admin", "support"]);
  const name = String(form.get("full_name") ?? "").trim().slice(0, 120);
  const country = String(form.get("country_code") ?? "").trim().toUpperCase();
  const patch: Record<string, unknown> = { full_name: name || null, country_code: /^[A-Z]{2}$/.test(country) ? country : null };
  // admins can only turn marketing emails OFF for someone (on request); opting in is the student's own choice
  if (form.get("unsubscribe") === "on") patch.marketing_opt_in = false;
  await createAdminClient().from("profiles").update(patch).eq("id", userId);
  await createAdminClient().from("audit_log").insert({ actor_id: admin.id, action: "profile.updated_by_staff", entity: "profiles", entity_id: userId, data: { fields: Object.keys(patch) } });
  revalidatePath(`/admin/students/${userId}`);
}
