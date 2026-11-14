"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { notifyLessonCompleted } from "@/app/actions/progress";

export type QuizQuestion = { id: string; prompt: string; image?: string | null; options: { id: string; text: string }[] };
/** The student's latest attempt, with the answer key (from the quiz_review RPC). */
export type QuizReview = { answers: Record<string, string>; score: number; passed: boolean; submitted_at: string; key: Record<string, string> };

type Mode = "take" | "result" | "review";

export function QuizLesson({ lessonId, courseId, questions, passPct, canSubmit, lastAttempt }: {
  lessonId: string; courseId: string; questions: QuizQuestion[]; passPct: number; canSubmit: boolean; lastAttempt?: QuizReview | null;
}) {
  const router = useRouter();
  const [review, setReview] = useState<QuizReview | null>(lastAttempt ?? null);
  const [mode, setMode] = useState<Mode>(lastAttempt ? "result" : "take");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [i, setI] = useState(0);
  const [onlyWrong, setOnlyWrong] = useState(false);
  // questions the student marked to come back to (only while taking the quiz)
  const [flagged, setFlagged] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!questions.length) return <p className="text-muted">This quiz has no questions yet.</p>;

  const isRight = (r: QuizReview, qid: string) => Boolean(r.key[qid]) && r.answers[qid] === r.key[qid];
  const answeredCount = questions.filter((q) => answers[q.id]).length;

  function submit() {
    setError(null);
    start(async () => {
      const sb = createClient();
      const { data, error } = await sb.rpc("submit_quiz", { p_lesson: lessonId, p_answers: answers });
      const row = Array.isArray(data) ? data[0] : data;
      if (error || !row) { setError("Your answers couldn't be submitted. Check your connection and try again."); return; }
      const { data: r } = await sb.rpc("quiz_review", { p_lesson: lessonId });
      setReview((r as QuizReview | null) ?? { answers, score: Number(row.score), passed: row.passed, submitted_at: new Date().toISOString(), key: {} });
      setMode("result");
      if (row.passed) await notifyLessonCompleted(courseId);
      router.refresh();
    });
  }

  function retake() { setAnswers({}); setFlagged({}); setI(0); setMode("take"); setError(null); }

  // ---------- Result summary ----------
  if (mode === "result" && review) {
    // without the answer key (review couldn't be loaded) show the score only
    const hasKey = Object.keys(review.key ?? {}).length > 0;
    const right = questions.filter((q) => isRight(review, q.id)).length;
    const wrong = questions.length - right;
    return (
      <div className="fc-card grid gap-5 p-6 text-center sm:p-8">
        <p className="text-sm font-medium uppercase tracking-wide text-muted">Your result</p>
        <p className={`fc-display text-6xl ${review.passed ? "text-success" : "text-danger"}`}>{Math.round(Number(review.score))}%</p>
        <p className="text-lg font-semibold">{review.passed ? "Passed. Well done!" : `Not passed yet. You need ${passPct}% to pass.`}</p>
        {hasKey && <div className="mx-auto flex gap-6 text-sm">
          <span><strong className="text-success">{right}</strong> correct</span>
          <span><strong className="text-danger">{wrong}</strong> incorrect</span>
          <span><strong>{questions.length}</strong> questions</span>
        </div>}
        <div className="flex flex-wrap justify-center gap-3">
          {hasKey && <button type="button" className="fc-btn fc-btn-primary" onClick={() => { setOnlyWrong(false); setI(0); setMode("review"); }}>Review answers</button>}
          {hasKey && wrong > 0 && (
            <button type="button" className="fc-btn fc-btn-outline" onClick={() => {
              setOnlyWrong(true); setI(questions.findIndex((q) => !isRight(review, q.id))); setMode("review");
            }}>Review incorrect only</button>
          )}
          {canSubmit && <button type="button" className="fc-btn fc-btn-outline" onClick={retake}>Retake quiz</button>}
        </div>
      </div>
    );
  }

  // ---------- Taking the quiz, or reviewing it, one question at a time ----------
  const reviewing = mode === "review" ? review : null;
  const visible = reviewing && onlyWrong ? questions.map((q, k) => [q, k] as const).filter(([q]) => !isRight(reviewing, q.id)).map(([, k]) => k) : questions.map((_, k) => k);
  const pos = Math.max(0, visible.indexOf(i));
  const q = questions[i];
  const chosen = reviewing ? reviewing.answers[q.id] : answers[q.id];
  const correctId = reviewing ? reviewing.key[q.id] : undefined;
  const last = pos === visible.length - 1;
  const go = (k: number) => { setI(k); if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" }); };

  return (
    <div className="grid gap-5">
      {/* progress */}
      <div className="grid gap-2">
        <div className="flex items-center justify-between text-sm text-muted">
          <span>Question {pos + 1} of {visible.length}{reviewing && onlyWrong ? " incorrect" : ""}</span>
          {reviewing
            ? <button type="button" className="underline" onClick={() => setMode("result")}>Back to result</button>
            : <span>{answeredCount} of {questions.length} answered</span>}
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-surface">
          <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${(reviewing ? (pos + 1) / visible.length : answeredCount / questions.length) * 100}%` }} />
        </div>
      </div>

      {/* question */}
      <fieldset className="fc-card p-5 sm:p-6">
        <legend className="sr-only">Question {i + 1}</legend>
        <div className="flex items-start justify-between gap-3">
          <p className="font-semibold leading-snug"><span className="whitespace-pre-line">{i + 1}. {q.prompt}</span></p>
          {!reviewing && (
            <button type="button" aria-pressed={Boolean(flagged[q.id])} onClick={() => setFlagged({ ...flagged, [q.id]: !flagged[q.id] })}
              className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold ${flagged[q.id] ? "border-warning bg-warning/15 text-warning" : "border-line"}`}>
              {flagged[q.id] ? "⚑ Flagged" : "⚐ Flag for review"}
            </button>
          )}
          {reviewing && (
            isRight(reviewing, q.id)
              ? <span className="shrink-0 rounded-full bg-success/15 px-2.5 py-1 text-xs font-semibold text-success">Correct</span>
              : <span className="shrink-0 rounded-full bg-danger/15 px-2.5 py-1 text-xs font-semibold text-danger">{chosen ? "Incorrect" : "Not answered"}</span>
          )}
        </div>
        {q.image && (
          <a href={q.image} target="_blank" rel="noopener noreferrer" className="mt-4 block" title="Open full size">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={q.image} alt={`Chart for question ${i + 1}`} className="max-h-[420px] w-full rounded-md border border-line bg-white object-contain" />
          </a>
        )}
        <div className="mt-4 grid gap-2">
          {q.options.map((o, k) => {
            const isChosen = chosen === o.id;
            const isCorrect = reviewing && correctId === o.id;
            const tag = !reviewing ? null
              : isCorrect ? { t: isChosen ? "Your answer ✓" : "Correct answer", cls: "text-success" }
              : isChosen ? { t: "Your answer ✗", cls: "text-danger" } : null;
            const tone = !reviewing
              ? isChosen ? "border-accent bg-accent/10" : "border-line hover:bg-surface"
              : isCorrect ? "border-success bg-success/10" : isChosen ? "border-danger bg-danger/10" : "border-line opacity-80";
            return (
              <label key={o.id} className={`flex items-center gap-3 rounded-md border p-3 ${reviewing ? "" : "cursor-pointer"} ${tone}`}>
                <input type="radio" name={q.id} value={o.id} checked={isChosen} disabled={Boolean(reviewing)} className="shrink-0"
                  onChange={() => setAnswers({ ...answers, [q.id]: o.id })} />
                <span className="text-muted">{"ABCDEFGHIJ"[k]}.</span>
                {/* the tag sits beside the answer on wider screens and under it on phones */}
                <span className="flex-1">{o.text}{tag && <span className={`mt-1 block text-xs font-semibold sm:hidden ${tag.cls}`}>{tag.t}</span>}</span>
                {tag && <span className={`hidden shrink-0 text-xs font-semibold sm:inline ${tag.cls}`}>{tag.t}</span>}
              </label>
            );
          })}
        </div>
      </fieldset>

      {error && <p className="text-sm text-danger">{error}</p>}

      {/* navigation */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button type="button" className="fc-btn fc-btn-outline" disabled={pos === 0} onClick={() => go(visible[pos - 1])}>← Previous</button>
        {reviewing ? (
          last
            ? <button type="button" className="fc-btn fc-btn-primary" onClick={() => setMode("result")}>Finish review</button>
            : <button type="button" className="fc-btn fc-btn-primary" onClick={() => go(visible[pos + 1])}>Next →</button>
        ) : !last ? (
          <button type="button" className="fc-btn fc-btn-primary" onClick={() => go(visible[pos + 1])}>Next →</button>
        ) : !canSubmit ? (
          <p className="text-sm text-muted">Enroll to submit this quiz.</p>
        ) : answeredCount < questions.length ? (
          <button type="button" className="fc-btn fc-btn-primary" onClick={() => go(questions.findIndex((x) => !answers[x.id]))}>
            Go to first unanswered ({questions.length - answeredCount} left)
          </button>
        ) : (
          <button type="button" className="fc-btn fc-btn-primary" disabled={pending} onClick={submit}>{pending ? "Checking…" : "Submit answers"}</button>
        )}
      </div>

      {/* jump to any question */}
      {!reviewing && (
        <p className="-mb-2 text-xs text-muted">
          Jump to any question. <span className="font-semibold text-ink">Highlighted</span> = answered · <span className="text-warning">●</span> = flagged for review
          {Object.values(flagged).some(Boolean) ? ` (${questions.filter((x) => flagged[x.id]).length} flagged)` : ""}
        </p>
      )}
      <div className="flex flex-wrap gap-1.5" aria-label="Questions">
        {visible.map((k) => {
          const qq = questions[k];
          const state = reviewing ? (isRight(reviewing, qq.id) ? "border-success bg-success/15 text-success" : "border-danger bg-danger/15 text-danger")
            : answers[qq.id] ? "border-accent bg-accent/15" : "border-line bg-white";
          // every question can be opened at any time, in any order
          const isFlagged = !reviewing && flagged[qq.id];
          return (
            <button key={qq.id} type="button" onClick={() => go(k)} aria-current={k === i ? "step" : undefined}
              aria-label={`Question ${k + 1}${!reviewing ? (answers[qq.id] ? ", answered" : ", not answered") : ""}${isFlagged ? ", flagged" : ""}`}
              className={`relative h-8 min-w-8 rounded-md border px-1.5 text-xs font-medium ${state} ${k === i ? "ring-2 ring-ink/60" : ""}`}>
              {k + 1}
              {isFlagged && <span aria-hidden className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-warning ring-2 ring-white" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
