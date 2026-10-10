"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { notifyLessonCompleted } from "@/app/actions/progress";

export function CompleteButton({ lessonId, courseId, done }: { lessonId: string; courseId: string; done: boolean }) {
  const router = useRouter();
  const [isDone, setDone] = useState(done);
  const [pending, start] = useTransition();
  if (isDone) return <p className="font-semibold text-success">✓ Completed</p>;
  return (
    <button disabled={pending} className="fc-btn fc-btn-primary" onClick={() => start(async () => {
      const { data, error } = await createClient().rpc("complete_lesson", { p_lesson: lessonId });
      if (!error) { setDone(true); if (Number(data) >= 100) await notifyLessonCompleted(courseId); router.refresh(); }
    })}>
      {pending ? "Saving…" : "Mark as complete"}
    </button>
  );
}
