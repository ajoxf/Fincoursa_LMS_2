"use server";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/auth";
import { sendEnrolled } from "@/lib/email/events";

export async function enrollFree(courseId: string, slug: string) {
  const user = await requireUser(`/courses/${slug}`);
  const { data: c } = await createAdminClient().from("courses").select("coming_soon").eq("id", courseId).maybeSingle();
  if (c?.coming_soon) redirect(`/courses/${slug}`); // not open for enrolment yet
  const supabase = await createClient();
  const { error } = await supabase.rpc("enroll_free", { p_course: courseId });
  if (error) throw new Error(error.message);
  // once per person per course (email log)
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) after(() => sendEnrolled(user.id, { courseId }, `${user.id}:${courseId}`));
  redirect(`/learn/${slug}`);
}

/** Free bundle: verify it's free server-side, then enrol in each course. */
export async function enrollFreeBundle(bundleId: string) {
  const user = await requireUser("/pages/programmes");
  const admin = createAdminClient();
  const { data: bundle } = await admin
    .from("bundles")
    .select("status, prices(amount_minor, is_active), bundle_courses(course_id, course:courses(access_days))")
    .eq("id", bundleId)
    .single();
  const paid = (bundle?.prices ?? []).some((p) => p.is_active && p.amount_minor > 0);
  if (!bundle || bundle.status !== "published" || paid) throw new Error("This programme is not free.");

  // each course's access period applies (null = lifetime)
  const now = Date.now();
  const expiry = (days: number | null | undefined) => (days && days > 0 ? new Date(now + days * 86_400_000).toISOString() : null);
  const courses = (bundle.bundle_courses ?? []).map((bc) => {
    const c = bc.course as { access_days: number | null } | { access_days: number | null }[] | null;
    return { course_id: bc.course_id, expires_at: expiry(Array.isArray(c) ? c[0]?.access_days : c?.access_days) };
  });
  const { data: existing } = await admin.from("enrollments").select("course_id, expires_at, revoked_at")
    .eq("user_id", user.id).in("course_id", courses.map((c) => c.course_id));
  const have = new Map((existing ?? []).map((e) => [e.course_id, e]));

  // new courses: enrol. Courses whose access ran out: renew. Anything else (active or removed by an admin) stays as it is.
  const fresh = courses.filter((c) => !have.has(c.course_id));
  const expired = courses.filter((c) => {
    const e = have.get(c.course_id);
    return e && !e.revoked_at && e.expires_at && new Date(e.expires_at).getTime() <= now;
  });
  if (fresh.length) {
    const { error } = await admin.from("enrollments").upsert(
      fresh.map((c) => ({ user_id: user.id, course_id: c.course_id, source: "bundle", bundle_id: bundleId, expires_at: c.expires_at, revoked_at: null })),
      { onConflict: "user_id,course_id", ignoreDuplicates: true });
    if (error) throw new Error(error.message);
  }
  for (const c of expired) {
    const { error } = await admin.from("enrollments").update({ expires_at: c.expires_at }).eq("user_id", user.id).eq("course_id", c.course_id);
    if (error) throw new Error(error.message);
  }
  if (fresh.length || expired.length) after(() => sendEnrolled(user.id, { bundleId }, `${user.id}:${bundleId}`));
  redirect("/dashboard");
}
