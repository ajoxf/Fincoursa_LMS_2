"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { notifyLessonCompleted } from "@/app/actions/progress";

export type QuizQuestion = { id: string; prompt: string; options: { id: string; text: string }[] };

export function QuizLesson({ lessonId, courseId, questions, passPct, canSubmit }: {
  lessonId: string; courseId: string; questions: QuizQuestion[]; passPct: number; canSubmit: boolean;
}) {
  const router = useRouter();
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<{ score: number; passed: boolean } | null>(null);
  const [pending, start] = useTransition();

  return (
    <form className="grid gap-6" onSubmit={(e) => {
      e.preventDefault();
      start(async () => {
        const { data, error } = await createClient().rpc("submit_quiz", { p_lesson: lessonId, p_answers: answers });
        const row = Array.isArray(data) ? data[0] : data;
        if (!error && row) {
          setResult({ score: Number(row.score), passed: row.passed });
          if (row.passed) await notifyLessonCompleted(courseId);
          router.refresh();
        }
      });
    }}>
      {questions.map((q, i) => (
        <fieldset key={q.id} className="fc-card p-5">
          <legend className="px-1 font-semibold">{i + 1}. {q.prompt}</legend>
          <div className="mt-3 grid gap-2">
            {q.options.map((o) => (
              <label key={o.id} className="flex items-center gap-3 rounded-md border border-line p-3 hover:bg-surface">
                <input type="radio" name={q.id} value={o.id} checked={answers[q.id] === o.id}
                  onChange={() => setAnswers({ ...answers, [q.id]: o.id })} />
                {o.text}
              </label>
            ))}
          </div>
        </fieldset>
      ))}
      {result && (
        <p className={`font-semibold ${result.passed ? "text-success" : "text-danger"}`}>
          You scored {result.score}% — {result.passed ? "passed!" : `you need ${passPct}% to pass. Try again.`}
        </p>
      )}
      {canSubmit ? (
        <button disabled={pending || Object.keys(answers).length < questions.length} className="fc-btn fc-btn-primary justify-self-start">
          {pending ? "Checking…" : "Submit answers"}
        </button>
      ) : <p className="text-sm text-muted">Enroll to submit this quiz.</p>}
    </form>
  );
}
