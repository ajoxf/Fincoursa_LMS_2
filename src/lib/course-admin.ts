import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { BuilderChapter } from "@/components/dash/CourseBuilder";

// Quiz answers are stored apart from the lesson body (quiz_answer_keys, admin-only), so students can't read them.
const LESSON_COLS = "id, title, type, position, is_preview, is_required, drip_days, duration_seconds, video_asset_id, starts_at, live_minutes, zoom_meeting_id, video:video_assets(status), body:lesson_bodies(body), quiz_key:quiz_answer_keys(answers, explanations)";

type RawLesson = BuilderChapter["lessons"][number] & { quiz_key?: { answers: Record<string, string> | null; explanations?: Record<string, string> | null } | null };

/** Curriculum for the builder, read with the user's session (RLS: admins and the course's instructors). */
export async function getCurriculum(courseId: string): Promise<BuilderChapter[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("chapters").select(`id, title, position, lessons(${LESSON_COLS})`).eq("course_id", courseId);
  const chapters = (data ?? []) as unknown as (Omit<BuilderChapter, "lessons"> & { lessons: RawLesson[] })[];
  // put each question's correct answer and explanation back so the editor can show and re-save them
  return chapters.map((c) => ({
    ...c,
    lessons: c.lessons.map(({ quiz_key, ...l }) => {
      const answers = quiz_key?.answers ?? {};
      const notes = quiz_key?.explanations ?? {};
      const qs = l.body?.body?.questions;
      return qs ? { ...l, body: { body: { ...l.body!.body, questions: qs.map((q) => ({ ...q, correct: answers[q.id] ?? q.correct ?? "", explanation: notes[q.id] ?? q.explanation ?? "" })) } } } : l;
    }),
  }));
}
