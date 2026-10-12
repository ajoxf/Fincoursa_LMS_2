"use server";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/auth";
import { sendEnrolled } from "@/lib/email/events";

export async function enrollFree(courseId: string, slug: string) {
  const user = await requireUser(`/courses/${slug}`);
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
    .select("status, prices(amount_minor, is_active), bundle_courses(course_id)")
    .eq("id", bundleId)
    .single();
  const paid = (bundle?.prices ?? []).some((p) => p.is_active && p.amount_minor > 0);
  if (!bundle || bundle.status !== "published" || paid) throw new Error("This programme is not free.");
  const rows = (bundle.bundle_courses ?? []).map((bc) => ({
    user_id: user.id, course_id: bc.course_id, source: "bundle", bundle_id: bundleId, revoked_at: null,
  }));
  if (rows.length) {
    const { error } = await admin.from("enrollments").upsert(rows, { onConflict: "user_id,course_id", ignoreDuplicates: true });
    if (error) throw new Error(error.message);
    after(() => sendEnrolled(user.id, { bundleId }, `${user.id}:${bundleId}`));
  }
  redirect("/dashboard");
}
