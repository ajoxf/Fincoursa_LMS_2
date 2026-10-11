"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { notifyLessonCompleted } from "@/app/actions/progress";

const arrow = <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden><path d="M2 7h9M7.5 3.5 11 7l-3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>;
const btn = "inline-flex items-center gap-2 rounded bg-ink px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-white transition hover:bg-black disabled:opacity-60";

/**
 * Footer action of the lesson player.
 * - "complete": text/PDF/download lessons; marks the lesson complete, then moves to the next one.
 * - "continue": video and quiz lessons (they complete by watching / passing) or lessons already done.
 */
export function CompleteButton({ lessonId, courseId, mode, nextHref }: {
  lessonId: string; courseId: string; mode: "complete" | "continue"; nextHref: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (mode === "continue") {
    return nextHref ? <button className={btn} onClick={() => router.push(nextHref)}>Continue {arrow}</button>
      : <button className={btn} onClick={() => router.push("/dashboard")}>Back to my courses {arrow}</button>;
  }
  return (
    <div className="flex flex-col items-center gap-2">
      <button disabled={pending} className={btn} onClick={() => start(async () => {
        setError(null);
        const { data, error } = await createClient().rpc("complete_lesson", { p_lesson: lessonId });
        if (error) { setError("Couldn't save your progress. Please try again."); return; }
        if (Number(data) >= 100) await notifyLessonCompleted(courseId);
        if (nextHref) router.push(nextHref); else router.refresh();
      })}>
        {pending ? "Saving…" : <>{nextHref ? "Complete & continue" : "Complete course"} {arrow}</>}
      </button>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
