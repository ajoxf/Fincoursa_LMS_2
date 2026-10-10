"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";

// All writes use the signed-in user's client, so RLS limits them to admins and the course's own instructors.
async function db() {
  await requireUser();
  return createClient();
}
const done = (courseId: string) => revalidatePath(`/instructor/courses/${courseId}`);

export async function addChapter(courseId: string, title: string) {
  const s = await db();
  const { count } = await s.from("chapters").select("id", { count: "exact", head: true }).eq("course_id", courseId);
  const { error } = await s.from("chapters").insert({ course_id: courseId, title: title.trim() || "New chapter", position: (count ?? 0) + 1 });
  if (error) throw new Error(error.message);
  done(courseId);
}

export async function addLesson(courseId: string, chapterId: string, title: string, type: string) {
  const s = await db();
  const { count } = await s.from("lessons").select("id", { count: "exact", head: true }).eq("chapter_id", chapterId);
  const { data, error } = await s.from("lessons")
    .insert({ course_id: courseId, chapter_id: chapterId, title: title.trim() || "New lesson", type, position: (count ?? 0) + 1 })
    .select("id").single();
  if (error) throw new Error(error.message);
  await s.from("lesson_bodies").insert({ lesson_id: data.id, body: {} });
  done(courseId);
}

export async function updateLesson(courseId: string, lessonId: string, patch: { title?: string; is_preview?: boolean; drip_days?: number | null }) {
  const s = await db();
  const { error } = await s.from("lessons").update(patch).eq("id", lessonId);
  if (error) throw new Error(error.message);
  done(courseId);
}

export async function saveLessonText(courseId: string, lessonId: string, text: string) {
  const s = await db();
  const { data } = await s.from("lesson_bodies").select("body").eq("lesson_id", lessonId).maybeSingle();
  const body = { ...((data?.body as object) ?? {}), text };
  const { error } = await s.from("lesson_bodies").upsert({ lesson_id: lessonId, body });
  if (error) throw new Error(error.message);
  done(courseId);
}

export async function deleteLesson(courseId: string, lessonId: string) {
  const s = await db();
  const { error } = await s.from("lessons").delete().eq("id", lessonId);
  if (error) throw new Error(error.message);
  done(courseId);
}

export async function refreshCourse(courseId: string) {
  done(courseId);
}
