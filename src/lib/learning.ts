import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth";

export async function getEnrollment(courseId: string) {
  const user = await getSessionUser();
  if (!user) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("enrollments")
    .select("id, progress_pct, last_lesson_id, completed_at, expires_at, revoked_at")
    .eq("course_id", courseId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!data || data.revoked_at || (data.expires_at && new Date(data.expires_at) < new Date())) return null;
  return data;
}
