import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { BuilderChapter } from "@/components/dash/CourseBuilder";

const LESSON_COLS = "id, title, type, position, is_preview, is_required, drip_days, duration_seconds, video_asset_id, starts_at, live_minutes, zoom_meeting_id, video:video_assets(status), body:lesson_bodies(body)";

/** Curriculum for the builder, read with the user's session (RLS: admins and the course's instructors). */
export async function getCurriculum(courseId: string): Promise<BuilderChapter[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("chapters").select(`id, title, position, lessons(${LESSON_COLS})`).eq("course_id", courseId);
  return (data ?? []) as unknown as BuilderChapter[];
}
