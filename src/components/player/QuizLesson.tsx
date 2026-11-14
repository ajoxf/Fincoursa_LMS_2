"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { notifyLessonCompleted } from "@/app/actions/progress";

export type QuizQuestion = { id: string; prompt: string; image?: string | null; options: { id: string; text: string }[] };
/** The student's latest attempt, with the answer key (from the quiz_review RPC). */
export type QuizReview = { answers: Record<string, string>; score: number; passed: boolean; submitted_at: string; key: Record<string, string>; explanations?: Record<string, string> };

// choose: pick practice or exam · take: answering · result/review: after submitting · practiceDone: practice summary
type Mode = "choose" | "take" | "result" | "review" | "practiceDone";
type Checked = { correct: string; explanation: string };

/** An explanation, split into paragraphs with a leading label such as "Why:" in bold. */
function Explanation({ text }: { text: string }) {
  return (
    <div className="mt-4 rounded-md border border-line bg-surface p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">Explanation</p>
      <div className="mt-2 grid gap-2 text-[15px] leading-relaxed">
        {text.split(/\n{2,}/).map((para, k) => {
          const m = /^(Answer|Why not the others|Why|Remember|Key idea|Calculation):/.exec(para);
          return (
            <p key={k} className="whitespace-pre-line">
              {m ? <><strong className="font-semibold">{m[1]}:</strong>{para.slice(m[0].length)}</> : para}
            </p>
          );
        })}
      </div>
    </div>
  );
}

export function QuizLesson({ lessonId, courseId, questions, passPct, canSubmit, lastAttempt }: {
  lessonId: string; courseId: string; questions: QuizQuestion[]; passPct: number; canSubmit: boolean; lastAttempt?: QuizReview | null;
}) {
  const router = useRouter();
  const [review, setReview] = useState<QuizReview | null>(lastAttempt ?? null);
  // enrolled students pick a mode first; others can only look through the questions
  const [mode, setMode] = useState<Mode>(lastAttempt ? "result" : canSubmit ? "choose" : "take");
  // practice mode: each question is checked on its own, and nothing is submitted
  const [practice, setPractice] = useState(false);
  const [checked, setChecked] = useState<Record<string, Checked>>({});
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

  function begin(asPractice: boolean) {
    setPractice(asPractice); setAnswers({}); setFlagged({}); setChecked({}); setI(0); setError(null); setMode("take");
  }
  const retake = () => setMode("choose");

  function check(qid: string) {
    setError(null);
    start(async () => {
      const { data, error } = await createClient().rpc("quiz_check", { p_lesson: lessonId, p_question: qid });
      const r = data as Checked | null;
      if (error || !r?.correct) { setError("This answer couldn't be checked. Check your connection and try again."); return; }
      setChecked((c) => ({ ...c, [qid]: r }));
    });
  }

  // ---------- Choose practice or exam ----------
  if (mode === "choose") {
    return (
      <div className="fc-card grid gap-5 p-6 sm:p-8">
        <div className="text-center">
          <p className="text-sm font-medium uppercase tracking-wide text-muted">{questions.length} questions</p>
          <p className="mt-1 text-xl font-semibold">How would you like to take this quiz?</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <button type="button" onClick={() => begin(true)} className="grid gap-1 rounded-lg border border-line p-5 text-left hover:border-ink hover:bg-surface">
            <span className="text-lg font-semibold">Practice mode</span>
            <span className="text-sm text-muted">Check each answer as you go and see the explanation straight away. Practice isn&apos;t scored.</span>
          </button>
          <button type="button" onClick={() => begin(false)} className="grid gap-1 rounded-lg border border-line p-5 text-left hover:border-ink hover:bg-surface">
            <span className="text-lg font-semibold">Exam mode</span>
            <span className="text-sm text-muted">Answer every question, then submit for your score{passPct ? ` (${passPct}% to pass)` : ""}. Review answers and explanations afterwards.</span>
          </button>
        </div>
        {review && <button type="button" className="justify-self-center text-sm underline" onClick={() => setMode("result")}>Back to my last result</button>}
      </div>
    );
  }

  // ---------- Practice summary ----------
  if (mode === "practiceDone") {
    const done = questions.filter((x) => checked[x.id]);
    const right = done.filter((x) => answers[x.id] === checked[x.id].correct).length;
    return (
      <div className="fc-card grid gap-5 p-6 text-center sm:p-8">
        <p className="text-sm font-medium uppercase tracking-wide text-muted">Practice finished</p>
        <p className="fc-display text-6xl">{right}<span className="text-3xl text-muted"> / {done.length}</span></p>
        <p className="text-lg font-semibold">correct out of the questions you checked</p>
        {done.length < questions.length && <p className="text-sm text-muted">{questions.length - done.length} questions weren&apos;t checked.</p>}
        <div className="flex flex-wrap justify-center gap-3">
          <button type="button" className="fc-btn fc-btn-primary" onClick={() => begin(false)}>Take it in exam mode</button>
          <button type="button" className="fc-btn fc-btn-outline" onClick={() => begin(true)}>Practise again</button>
          <button type="button" className="fc-btn fc-btn-outline" onClick={() => setMode("take")}>Back to the questions</button>
        </div>
      </div>
    );
  }

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
          {canSubmit && <button type="button" className="fc-btn fc-btn-outline" onClick={retake}>Retake or practise</button>}
        </div>
      </div>
    );
  }

  // ---------- Taking the quiz, or reviewing it, one question at a time ----------
  const reviewing = mode === "review" ? review : null;
  const visible = reviewing && onlyWrong ? questions.map((q, k) => [q, k] as const).filter(([q]) => !isRight(reviewing, q.id)).map(([, k]) => k) : questions.map((_, k) => k);
  const pos = Math.max(0, visible.indexOf(i));
  const q = questions[i];
  // a checked practice question is shown like a reviewed one
  const practiced = !reviewing && practice ? checked[q.id] : undefined;
  const locked = Boolean(reviewing || practiced);
  const chosen = reviewing ? reviewing.answers[q.id] : answers[q.id];
  const correctId = reviewing ? reviewing.key[q.id] : practiced?.correct;
  const explanation = reviewing ? reviewing.explanations?.[q.id] : practiced?.explanation;
  const checkedCount = questions.filter((x) => checked[x.id]).length;
  const last = pos === visible.length - 1;
  const go = (k: number) => { setI(k); if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" }); };

  return (
    <div className="grid gap-5">
      {/* progress */}
      <div className="grid gap-2">
        <div className="flex items-center justify-between text-sm text-muted">
          <span>
            {practice && !reviewing && <span className="mr-2 rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-ink">Practice</span>}
            Question {pos + 1} of {visible.length}{reviewing && onlyWrong ? " incorrect" : ""}
          </span>
          {reviewing
            ? <button type="button" className="underline" onClick={() => setMode("result")}>Back to result</button>
            : practice ? <span>{checkedCount} of {questions.length} checked</span>
            : <span>{answeredCount} of {questions.length} answered</span>}
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-surface">
          <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${(reviewing ? (pos + 1) / visible.length : (practice ? checkedCount : answeredCount) / questions.length) * 100}%` }} />
        </div>
      </div>

      {/* question */}
      <fieldset className="fc-card p-5 sm:p-6">
        <legend className="sr-only">Question {i + 1}</legend>
        <div className="flex items-start justify-between gap-3">
          <p className="font-semibold leading-snug"><span className="whitespace-pre-line">{i + 1}. {q.prompt}</span></p>
          {!locked && (
            <button type="button" aria-pressed={Boolean(flagged[q.id])} onClick={() => setFlagged({ ...flagged, [q.id]: !flagged[q.id] })}
              className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold ${flagged[q.id] ? "border-warning bg-warning/15 text-warning" : "border-line"}`}>
              {flagged[q.id] ? "⚑ Flagged" : "⚐ Flag for review"}
            </button>
          )}
          {practiced && (
            chosen === practiced.correct
              ? <span className="shrink-0 rounded-full bg-success/15 px-2.5 py-1 text-xs font-semibold text-success">Correct</span>
              : <span className="shrink-0 rounded-full bg-danger/15 px-2.5 py-1 text-xs font-semibold text-danger">Incorrect</span>
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
            const isCorrect = locked && correctId === o.id;
            const tag = !locked ? null
              : isCorrect ? { t: isChosen ? "Your answer ✓" : "Correct answer", cls: "text-success" }
              : isChosen ? { t: "Your answer ✗", cls: "text-danger" } : null;
            const tone = !locked
              ? isChosen ? "border-accent bg-accent/10" : "border-line hover:bg-surface"
              : isCorrect ? "border-success bg-success/10" : isChosen ? "border-danger bg-danger/10" : "border-line opacity-80";
            return (
              <label key={o.id} className={`flex items-center gap-3 rounded-md border p-3 ${locked ? "" : "cursor-pointer"} ${tone}`}>
                <input type="radio" name={q.id} value={o.id} checked={isChosen} disabled={locked} className="shrink-0"
                  onChange={() => setAnswers({ ...answers, [q.id]: o.id })} />
                <span className="text-muted">{"ABCDEFGHIJ"[k]}.</span>
                {/* the tag sits beside the answer on wider screens and under it on phones */}
                <span className="flex-1">{o.text}{tag && <span className={`mt-1 block text-xs font-semibold sm:hidden ${tag.cls}`}>{tag.t}</span>}</span>
                {tag && <span className={`hidden shrink-0 text-xs font-semibold sm:inline ${tag.cls}`}>{tag.t}</span>}
              </label>
            );
          })}
        </div>
        {practice && !reviewing && !practiced && (
          <button type="button" className="fc-btn fc-btn-dark mt-4 !min-w-0" disabled={!answers[q.id] || pending} onClick={() => check(q.id)}>
            {pending ? "Checking…" : answers[q.id] ? "Check answer" : "Choose an answer to check it"}
          </button>
        )}
        {locked && explanation && <Explanation text={explanation} />}
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
        ) : practice ? (
          <button type="button" className="fc-btn fc-btn-primary" onClick={() => setMode("practiceDone")}>Finish practice</button>
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
          Jump to any question. {practice ? <><span className="text-success">Green</span> / <span className="text-danger">red</span> = checked · </> : null}<span className="font-semibold text-ink">Highlighted</span> = answered · <span className="text-warning">●</span> = flagged for review
          {Object.values(flagged).some(Boolean) ? ` (${questions.filter((x) => flagged[x.id]).length} flagged)` : ""}
        </p>
      )}
      <div className="flex flex-wrap gap-1.5" aria-label="Questions">
        {visible.map((k) => {
          const qq = questions[k];
          const ck = practice ? checked[qq.id] : undefined;
          const state = reviewing ? (isRight(reviewing, qq.id) ? "border-success bg-success/15 text-success" : "border-danger bg-danger/15 text-danger")
            : ck ? (answers[qq.id] === ck.correct ? "border-success bg-success/15 text-success" : "border-danger bg-danger/15 text-danger")
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
