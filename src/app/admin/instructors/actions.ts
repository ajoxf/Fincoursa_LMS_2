"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/send";
import { staffInviteEmail } from "@/lib/email/templates";
import { env } from "@/lib/env";

export type FormState = { ok?: boolean; error?: string; message?: string } | null;
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);

export async function createInstructor(form: FormData) {
  await requireRole(["admin"]);
  const name = String(form.get("name") ?? "").trim();
  if (!name) throw new Error("Name required");
  const db = createAdminClient();
  let slug = slugify(name);
  if ((await db.from("instructors").select("id").eq("slug", slug).maybeSingle()).data) slug = `${slug}-${Date.now().toString(36)}`;
  const { data: last } = await db.from("instructors").select("sort_order").order("sort_order", { ascending: false }).limit(1).maybeSingle();
  const { data, error } = await db.from("instructors").insert({ name, slug, sort_order: (last?.sort_order ?? 0) + 1, is_published: false }).select("id").single();
  if (error || !data) throw new Error(error?.message ?? "Could not create instructor");
  redirect(`/admin/instructors/${data.id}`);
}

export async function saveInstructor(id: string, _: FormState, form: FormData): Promise<FormState> {
  await requireRole(["admin"]);
  const name = String(form.get("name") ?? "").trim();
  if (!name) return { error: "Name is required" };
  const share = Number(form.get("default_revenue_share_pct") || 0);
  const db = createAdminClient();

  // Optional: link a login so the instructor sees their own dashboard
  const email = String(form.get("login_email") ?? "").trim().toLowerCase();
  let userId: string | null | undefined = undefined;
  let invited: string | null = null;
  if (email) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Enter a valid email address" };
    let { data: profile } = await db.from("profiles").select("id").eq("email", email).maybeSingle();
    if (!profile) {
      // no account yet: create one and email them a link to set it up
      const { data: created, error: cErr } = await db.auth.admin.createUser({ email, email_confirm: true, user_metadata: { full_name: name } });
      if (cErr || !created.user) return { error: `Could not create an account for ${email}: ${cErr?.message ?? "unknown error"}` };
      profile = { id: created.user.id };
      const m = staffInviteEmail({ name, role: "instructor", url: `${env.siteUrl}/users/sign_in?invite=1&email=${encodeURIComponent(email)}&next=/instructor` });
      const sent = await sendEmail({ to: email, ...m, template: "instructor_invite", ref: created.user.id });
      invited = sent ? `Account created and an invitation emailed to ${email}.`
        : `Account created for ${email}, but the invitation email couldn't be sent. They can sign in at the Sign In page with just their email (we email them a link).`;
    }
    const { data: taken } = await db.from("instructors").select("id").eq("user_id", profile.id).neq("id", id).maybeSingle();
    if (taken) return { error: "That account is already linked to another instructor profile." };
    userId = profile.id;
    await db.from("user_roles").upsert({ user_id: profile.id, role: "instructor" });
  } else if (form.get("unlink") === "on") {
    userId = null;
  }

  const { error } = await db.from("instructors").update({
    name, title: String(form.get("title") ?? "").trim() || null, bio: String(form.get("bio") ?? "").trim() || null,
    photo_url: String(form.get("photo_url") ?? "") || null, org_logo_url: String(form.get("org_logo_url") ?? "") || null,
    default_revenue_share_pct: Math.min(100, Math.max(0, share)), is_published: form.get("is_published") === "on",
    ...(userId !== undefined ? { user_id: userId } : {}),
  }).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(`/admin/instructors/${id}`);
  revalidatePath("/admin/instructors");
  return invited ? { ok: true, message: invited } : { ok: true };
}

/**
 * Delete an instructor. Not allowed once they have earnings or payouts (financial records must stay):
 * then they can be hidden instead. Removes them from their courses, their agreements (and files) and,
 * when no other instructor profile uses the login, the instructor role on that account.
 */
export async function deleteInstructor(id: string): Promise<{ ok: boolean; error?: string }> {
  const admin = await requireRole(["admin"]);
  const db = createAdminClient();
  const { data: ins } = await db.from("instructors").select("id, name, user_id").eq("id", id).maybeSingle();
  if (!ins) return { ok: false, error: "Instructor not found" };
  const [{ count: earnings }, { count: payouts }] = await Promise.all([
    db.from("instructor_earnings").select("id", { count: "exact", head: true }).eq("instructor_id", id),
    db.from("payouts").select("id", { count: "exact", head: true }).eq("instructor_id", id),
  ]);
  if ((earnings ?? 0) > 0 || (payouts ?? 0) > 0) {
    return { ok: false, error: `${ins.name} has earnings or payouts on record, so they can't be deleted (the finance history must stay). Untick "Show on the Instructors page" to hide them instead, and remove them from their courses.` };
  }
  const { data: files } = await db.from("agreements").select("file_path").eq("instructor_id", id).not("file_path", "is", null);
  const { error } = await db.from("instructors").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  if (files?.length) await db.storage.from("agreements").remove(files.map((f) => f.file_path as string));
  if (ins.user_id) {
    const { count: other } = await db.from("instructors").select("id", { count: "exact", head: true }).eq("user_id", ins.user_id);
    if (!other) await db.from("user_roles").delete().eq("user_id", ins.user_id).eq("role", "instructor");
  }
  await db.from("audit_log").insert({ actor_id: admin.id, action: "instructor.deleted", entity: "instructor", entity_id: id, data: { name: ins.name } });
  revalidatePath("/admin/instructors");
  revalidatePath("/pages/instructors");
  revalidatePath("/", "layout");
  return { ok: true };
}
