"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { env } from "@/lib/env";

export type AnnounceState = { ok: boolean; message: string; campaignId?: string; total?: number } | null;

const schema = z.object({
  title: z.string().trim().min(1, "Add a short title").max(150),
  body: z.string().trim().min(1, "Write the update").max(10000),
});

/** Post an update to everyone enrolled in a course; optionally email them too (sent batch by batch from the page). */
export async function postAnnouncement(courseId: string, _: AnnounceState, form: FormData): Promise<AnnounceState> {
  const me = await requireRole(["admin"]);
  const r = schema.safeParse(Object.fromEntries(form));
  if (!r.success) return { ok: false, message: r.error.issues[0].message };
  const db = createAdminClient();
  const { data: course } = await db.from("courses").select("title, slug").eq("id", courseId).single();
  if (!course) return { ok: false, message: "Course not found" };
  const { data: a, error } = await db.from("course_announcements")
    .insert({ course_id: courseId, title: r.data.title, body: r.data.body, created_by: me.id }).select("id").single();
  if (error || !a) return { ok: false, message: error?.message ?? "Could not post" };
  revalidatePath(`/admin/courses/${courseId}`);

  if (form.get("email") !== "on") return { ok: true, message: "Posted. Students see it in the course and on their dashboard." };
  const { data: c, error: cErr } = await db.from("email_campaigns").insert({
    kind: "announcement", subject: `${course.title}: ${r.data.title}`, heading: r.data.title, body: r.data.body,
    cta_label: "Open the course", cta_url: `${env.siteUrl}/learn/${course.slug}`,
    audience: { courses: [courseId] }, status: "sending", created_by: me.id,
  }).select("id").single();
  if (cErr || !c) return { ok: false, message: `Posted, but the email couldn't start: ${cErr?.message}` };
  await db.from("course_announcements").update({ campaign_id: c.id }).eq("id", a.id);
  const { data: total } = await db.rpc("enqueue_campaign", { p_campaign: c.id });
  return { ok: true, message: "Posted. Emailing enrolled students…", campaignId: c.id, total: Number(total) };
}

export async function deleteAnnouncement(courseId: string, id: string) {
  await requireRole(["admin"]);
  await createAdminClient().from("course_announcements").delete().eq("id", id).eq("course_id", courseId);
  revalidatePath(`/admin/courses/${courseId}`);
}
