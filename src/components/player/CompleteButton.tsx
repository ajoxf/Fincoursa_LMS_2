"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function CompleteButton({ lessonId, done }: { lessonId: string; done: boolean }) {
  const router = useRouter();
  const [isDone, setDone] = useState(done);
  const [pending, start] = useTransition();
  if (isDone) return <p className="font-semibold text-success">✓ Completed</p>;
  return (
    <button disabled={pending} className="fc-btn fc-btn-primary" onClick={() => start(async () => {
      const { error } = await createClient().rpc("complete_lesson", { p_lesson: lessonId });
      if (!error) { setDone(true); router.refresh(); }
    })}>
      {pending ? "Saving…" : "Mark as complete"}
    </button>
  );
}
