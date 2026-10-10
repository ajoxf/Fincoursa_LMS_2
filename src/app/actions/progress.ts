"use server";
import { after } from "next/server";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { sendCourseCompleted } from "@/lib/email/events";

/** Called by the player when a lesson completes; emails the certificate once the course is done. */
export async function notifyLessonCompleted(courseId: string) {
  const user = await requireUser();
  const { data: e } = await (await createClient())
    .from("enrollments").select("completed_at").eq("user_id", user.id).eq("course_id", courseId).maybeSingle();
  if (e?.completed_at && process.env.SUPABASE_SERVICE_ROLE_KEY) after(() => sendCourseCompleted(user.id, courseId));
}
