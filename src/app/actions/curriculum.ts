"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";

// Course authoring is admin-only. Writes also go through the signed-in user's client, so RLS enforces it again.
async function db() {
  await requireRole(["admin"]);
  return createClient();
}
const done = (courseId: string) => {
  revalidatePath(`/instructor/courses/${courseId}`);
  revalidatePath(`/admin/courses/${courseId}`);
};
const fail = (e: { message: string } | null) => { if (e) throw new Error(e.message); };

export async function addChapter(courseId: string, title: string) {
  const s = await db();
  const { data: last } = await s.from("chapters").select("position").eq("course_id", courseId).order("position", { ascending: false }).limit(1).maybeSingle();
  fail((await s.from("chapters").insert({ course_id: courseId, title: title.trim() || "New chapter", position: (last?.position ?? 0) + 1 })).error);
  done(courseId);
}

export async function renameChapter(courseId: string, chapterId: string, title: string) {
  const s = await db();
  fail((await s.from("chapters").update({ title: title.trim() || "Untitled chapter" }).eq("id", chapterId)).error);
  done(courseId);
}

export async function deleteChapter(courseId: string, chapterId: string) {
  const s = await db();
  fail((await s.from("chapters").delete().eq("id", chapterId)).error);
  done(courseId);
}

/** Swap position with the neighbour above/below. */
async function move(table: "chapters" | "lessons", scope: { col: string; val: string }, id: string, dir: -1 | 1) {
  const s = await db();
  const { data: rows } = await s.from(table).select("id, position").eq(scope.col, scope.val).order("position");
  const list = rows ?? [];
  const i = list.findIndex((r) => r.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return;
  // normalise positions, then swap
  const ordered = list.map((r, k) => ({ id: r.id, position: k + 1 }));
  [ordered[i].position, ordered[j].position] = [ordered[j].position, ordered[i].position];
  for (const r of ordered) fail((await s.from(table).update({ position: r.position }).eq("id", r.id)).error);
}

export async function moveChapter(courseId: string, chapterId: string, dir: -1 | 1) {
  await move("chapters", { col: "course_id", val: courseId }, chapterId, dir);
  done(courseId);
}

export async function moveLesson(courseId: string, chapterId: string, lessonId: string, dir: -1 | 1) {
  await move("lessons", { col: "chapter_id", val: chapterId }, lessonId, dir);
  done(courseId);
}

export async function addLesson(courseId: string, chapterId: string, title: string, type: string) {
  const s = await db();
  const { data: last } = await s.from("lessons").select("position").eq("chapter_id", chapterId).order("position", { ascending: false }).limit(1).maybeSingle();
  const { data, error } = await s.from("lessons")
    .insert({ course_id: courseId, chapter_id: chapterId, title: title.trim() || "New lesson", type, position: (last?.position ?? 0) + 1 })
    .select("id").single();
  fail(error);
  fail((await s.from("lesson_bodies").insert({ lesson_id: data!.id, body: type === "quiz" ? { pass_pct: 70, questions: [] } : {} })).error);
  done(courseId);
}

export type LessonPatch = {
  title?: string; is_preview?: boolean; is_required?: boolean; drip_days?: number | null;
  duration_seconds?: number; type?: string;
};

export async function updateLesson(courseId: string, lessonId: string, patch: LessonPatch) {
  const s = await db();
  fail((await s.from("lessons").update(patch).eq("id", lessonId)).error);
  await syncCourseDuration(courseId);
}

export type QuizQuestionInput = { id: string; prompt: string; options: { id: string; text: string }[]; correct: string };
export type BodyPatch = {
  text?: string;
  files?: { name: string; path: string }[];
  pass_pct?: number;
  questions?: QuizQuestionInput[];
};

/** Merge-saves the protected lesson body (text, files, quiz). */
export async function saveLessonBody(courseId: string, lessonId: string, patch: BodyPatch) {
  const s = await db();
  const { data } = await s.from("lesson_bodies").select("body").eq("lesson_id", lessonId).maybeSingle();
  const body = { ...((data?.body as object) ?? {}), ...patch };
  fail((await s.from("lesson_bodies").upsert({ lesson_id: lessonId, body })).error);
  done(courseId);
}

export async function deleteLesson(courseId: string, lessonId: string) {
  const s = await db();
  fail((await s.from("lessons").delete().eq("id", lessonId)).error);
  await syncCourseDuration(courseId);
}

/** Recalculate the course's advertised duration from its lessons. */
export async function syncCourseDuration(courseId: string) {
  const s = await db();
  const { data } = await s.from("lessons").select("duration_seconds").eq("course_id", courseId);
  const minutes = Math.round((data ?? []).reduce((a, l) => a + (l.duration_seconds ?? 0), 0) / 60);
  fail((await s.from("courses").update({ duration_minutes: minutes }).eq("id", courseId)).error);
  done(courseId);
}

export async function refreshCourse(courseId: string) {
  done(courseId);
}
