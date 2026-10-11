"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import MuxUploader from "@mux/mux-uploader-react";
import {
  addChapter, addLesson, deleteChapter, deleteLesson, moveChapter, moveLesson, refreshCourse, renameChapter,
  saveLessonBody, syncCourseDuration, updateLesson, type QuizQuestionInput,
} from "@/app/actions/curriculum";
import { FileUpload } from "./FileUpload";

export type BuilderLesson = {
  id: string; title: string; type: string; position: number; is_preview: boolean; is_required: boolean;
  drip_days: number | null; duration_seconds: number; video_asset_id: string | null;
  starts_at: string | null; live_minutes: number | null; zoom_meeting_id: string | null;
  video: { status: string } | null;
  body: { body: { text?: string; files?: { name: string; path: string }[]; pass_pct?: number; questions?: QuizQuestionInput[]; join_url?: string } } | null;
};
export type BuilderChapter = { id: string; title: string; position: number; lessons: BuilderLesson[] };

const TYPES = [
  { id: "video", label: "Video" }, { id: "text", label: "Text" }, { id: "pdf", label: "PDF" },
  { id: "quiz", label: "Quiz" }, { id: "audio", label: "Audio" }, { id: "download", label: "Download" },
  { id: "live", label: "Live (Zoom)" },
];

/** ISO -> value for <input type="datetime-local"> in the admin's own timezone */
const toLocalInput = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
const zoomId = (url: string) => url.match(/\/j\/(\d{9,12})/)?.[1] ?? null;

function TypeIcon({ type }: { type: string }) {
  const p = { width: 22, height: 22, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.4, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;
  switch (type) {
    case "video": return <svg {...p}><rect x="2.5" y="6" width="13" height="12" rx="1.5" /><path d="m15.5 10.5 6-3v9l-6-3" /></svg>;
    case "text": return <svg {...p}><path d="M6 2.5h8l4 4v15H6z" /><path d="M14 2.5v4h4M9 12h6M9 15.5h6" /></svg>;
    case "pdf": return <svg {...p}><path d="M6 2.5h8l4 4v8M6 2.5v8" /><text x="5" y="21" fontSize="7" fontWeight="700" fill="currentColor" stroke="none">PDF</text></svg>;
    case "quiz": return <svg {...p}><path d="m3 6 1.5 1.5L7 5M3 12l1.5 1.5L7 11M3 18l1.5 1.5L7 17M10 6h11M10 12h11M10 18h11" /></svg>;
    case "live": return <svg {...p}><circle cx="12" cy="12" r="3" /><path d="M7.5 7.5a6.5 6.5 0 0 0 0 9M16.5 7.5a6.5 6.5 0 0 1 0 9M4.5 4.5a10.5 10.5 0 0 0 0 15M19.5 4.5a10.5 10.5 0 0 1 0 15" /></svg>;
    case "audio": return <svg {...p}><rect x="9" y="2.5" width="6" height="12" rx="3" /><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5v4" /></svg>;
    default: return <svg {...p}><path d="M12 3v12M7 10l5 5 5-5M4 20h16" /></svg>;
  }
}
const byPos = <T extends { position: number }>(a: T[]) => [...a].sort((x, y) => x.position - y.position);

export function CourseBuilder({ courseId, chapters }: { courseId: string; chapters: BuilderChapter[] }) {
  const [pending, start] = useTransition();
  const [chapterTitle, setChapterTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<unknown>) => start(async () => {
    setError(null);
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : "Something went wrong"); }
  });
  const sorted = byPos(chapters);
  const lessonCount = sorted.reduce((n, c) => n + c.lessons.length, 0);

  return (
    <div className={`grid gap-5 transition ${pending ? "opacity-70" : ""}`}>
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted">
        <span>{sorted.length} chapters · {lessonCount} lessons</span>
        <button onClick={() => run(() => syncCourseDuration(courseId))} className="underline">Recalculate course length</button>
      </div>
      {error && <p className="rounded-md bg-danger/10 p-3 text-sm text-danger">{error}</p>}

      {sorted.map((ch, ci) => (
        <div key={ch.id} className="rounded-card border border-line">
          <div className="flex flex-wrap items-center gap-2 border-b border-line bg-surface px-3 py-2">
            <span className="text-xs font-semibold text-muted">Chapter {ci + 1}</span>
            <input defaultValue={ch.title} aria-label="Chapter title"
              onBlur={(e) => e.target.value !== ch.title && run(() => renameChapter(courseId, ch.id, e.target.value))}
              className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-2 py-1 font-semibold hover:border-line focus:border-line focus:bg-bg" />
            <IconBtn label="Move chapter up" disabled={ci === 0} onClick={() => run(() => moveChapter(courseId, ch.id, -1))}>↑</IconBtn>
            <IconBtn label="Move chapter down" disabled={ci === sorted.length - 1} onClick={() => run(() => moveChapter(courseId, ch.id, 1))}>↓</IconBtn>
            <button className="text-xs text-danger underline" onClick={() =>
              confirm(`Delete chapter "${ch.title}" and its ${ch.lessons.length} lessons? Student progress on them is lost.`) && run(() => deleteChapter(courseId, ch.id))}>
              Delete
            </button>
          </div>
          <ul className="divide-y divide-line">
            {byPos(ch.lessons).map((l, li, arr) => (
              <LessonRow key={l.id} courseId={courseId} chapterId={ch.id} lesson={l} first={li === 0} last={li === arr.length - 1} run={run} />
            ))}
            {!ch.lessons.length && <li className="p-4 text-sm text-muted">No lessons yet.</li>}
          </ul>
          <AddLesson onAdd={(title, type) => run(() => addLesson(courseId, ch.id, title, type))} />
        </div>
      ))}

      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); run(async () => { await addChapter(courseId, chapterTitle); setChapterTitle(""); }); }}>
        <input value={chapterTitle} onChange={(e) => setChapterTitle(e.target.value)} placeholder="New chapter title" className="fc-input" />
        <button className="fc-btn fc-btn-dark shrink-0">Add chapter</button>
      </form>
    </div>
  );
}

function IconBtn({ children, label, disabled, onClick }: { children: React.ReactNode; label: string; disabled?: boolean; onClick: () => void }) {
  return (
    <button type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick}
      className="h-7 w-7 rounded-md border border-line bg-bg text-sm disabled:opacity-30">{children}</button>
  );
}

function AddLesson({ onAdd }: { onAdd: (title: string, type: string) => void }) {
  // Thinkific-style: "+ Add lesson" opens a grid of lesson types; pick one, name it, add.
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const close = () => { setOpen(false); setType(null); setTitle(""); };
  if (!open) {
    return (
      <div className="border-t border-line p-2">
        <button type="button" onClick={() => setOpen(true)} className="flex w-full items-center justify-center gap-2 rounded-md py-2 text-sm font-medium hover:bg-surface">
          <span aria-hidden className="text-lg leading-none">+</span> Add lesson
        </button>
      </div>
    );
  }
  return (
    <div className="border-t border-line p-4">
      <div className="flex items-center justify-between">
        <p className="font-semibold">{type ? `New ${TYPES.find((t) => t.id === type)?.label.toLowerCase()} lesson` : "Lessons"}</p>
        <button type="button" aria-label="Close" onClick={close} className="h-8 w-8 rounded-md border border-line text-lg leading-none">×</button>
      </div>
      {!type ? (
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {TYPES.map((t) => (
            <button key={t.id} type="button" onClick={() => setType(t.id)}
              className="flex items-center gap-4 rounded-lg border border-line px-5 py-5 text-left font-medium hover:border-ink">
              <TypeIcon type={t.id} />{t.label}
            </button>
          ))}
        </div>
      ) : (
        <form className="mt-3 flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); if (!title.trim()) return; onAdd(title, type); close(); }}>
          <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Lesson title" className="fc-input min-w-48 flex-1" />
          <button type="button" onClick={() => setType(null)} className="fc-btn fc-btn-outline !min-w-0">Back</button>
          <button className="fc-btn fc-btn-dark !min-w-0">Add lesson</button>
        </form>
      )}
    </div>
  );
}

function statusOf(l: BuilderLesson) {
  const b = l.body?.body ?? {};
  if (l.type === "video") {
    const s = l.video?.status;
    return s === "ready" ? { t: "Video ready", ok: true } : s ? { t: s === "errored" ? "Video failed" : "Processing…", ok: false } : { t: "No video", ok: false };
  }
  if (l.type === "live") {
    if (l.video?.status === "ready") return { t: "Recording ready", ok: true };
    if (!l.starts_at) return { t: "No date set", ok: false };
    const when = new Date(l.starts_at).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
    return { t: b.join_url ? `Live ${when}` : `${when} · no Zoom link`, ok: Boolean(b.join_url) };
  }
  if (l.type === "quiz") return (b.questions?.length ?? 0) > 0 ? { t: `${b.questions!.length} questions`, ok: true } : { t: "No questions", ok: false };
  if (l.type === "pdf" || l.type === "download" || l.type === "audio") return (b.files?.length ?? 0) > 0 ? { t: `${b.files!.length} file(s)`, ok: true } : { t: "No file", ok: false };
  return b.text ? { t: "Has content", ok: true } : { t: "Empty", ok: false };
}

function LessonRow({ courseId, chapterId, lesson, first, last, run }: {
  courseId: string; chapterId: string; lesson: BuilderLesson; first: boolean; last: boolean; run: (fn: () => Promise<unknown>) => void;
}) {
  const [open, setOpen] = useState(false);
  const s = statusOf(lesson);
  return (
    <li className="p-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <IconBtn label="Move lesson up" disabled={first} onClick={() => run(() => moveLesson(courseId, chapterId, lesson.id, -1))}>↑</IconBtn>
        <IconBtn label="Move lesson down" disabled={last} onClick={() => run(() => moveLesson(courseId, chapterId, lesson.id, 1))}>↓</IconBtn>
        <span className="w-16 text-center text-[11px] font-semibold uppercase tracking-wide text-muted">{lesson.type}</span>
        <span className="min-w-0 flex-1 truncate font-medium">{lesson.title}</span>
        {lesson.is_preview && <span className="rounded-button bg-accent/15 px-2 py-0.5 text-[11px] font-semibold">Free preview</span>}
        {lesson.drip_days ? <span className="text-[11px] text-muted">Unlocks day {lesson.drip_days}</span> : null}
        <span className={`text-xs ${s.ok ? "text-success" : "text-warning"}`}>{s.t}</span>
        <button onClick={() => setOpen(!open)} className="rounded-md border border-line px-2 py-1 text-xs font-medium">{open ? "Close" : "Edit"}</button>
        <button onClick={() => confirm(`Delete lesson "${lesson.title}"? Student progress on it is lost.`) && run(() => deleteLesson(courseId, lesson.id))}
          className="text-xs text-danger underline">Delete</button>
      </div>
      {open && <LessonEditor courseId={courseId} lesson={lesson} onClose={() => setOpen(false)} />}
    </li>
  );
}

function LessonEditor({ courseId, lesson, onClose }: { courseId: string; lesson: BuilderLesson; onClose: () => void }) {
  const router = useRouter();
  const b = lesson.body?.body ?? {};
  const [title, setTitle] = useState(lesson.title);
  const [type, setType] = useState(lesson.type);
  const [preview, setPreview] = useState(lesson.is_preview);
  const [required, setRequired] = useState(lesson.is_required);
  const [drip, setDrip] = useState(lesson.drip_days?.toString() ?? "");
  const [minutes, setMinutes] = useState(lesson.duration_seconds ? String(Math.round(lesson.duration_seconds / 60)) : "");
  const [text, setText] = useState(b.text ?? "");
  const [files, setFiles] = useState(b.files ?? []);
  const [passPct, setPassPct] = useState(b.pass_pct ?? 70);
  const [questions, setQuestions] = useState<QuizQuestionInput[]>(b.questions ?? []);
  const [startsAt, setStartsAt] = useState(toLocalInput(lesson.starts_at));
  const [liveMinutes, setLiveMinutes] = useState(lesson.live_minutes?.toString() ?? "90");
  const [joinUrl, setJoinUrl] = useState(b.join_url ?? "");
  const [meetingId, setMeetingId] = useState(lesson.zoom_meeting_id ?? "");
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [pending, start] = useTransition();

  const save = () => start(async () => {
    setMsg(null);
    const bad = questions.find((q) => !q.prompt.trim() || q.options.filter((o) => o.text.trim()).length < 2 || !q.options.some((o) => o.id === q.correct));
    if (type === "quiz" && bad) { setMsg({ ok: false, t: "Each question needs text, at least two answers and a correct answer." }); return; }
    try {
      await updateLesson(courseId, lesson.id, {
        title: title.trim() || "Untitled lesson", type, is_preview: preview, is_required: required,
        drip_days: drip === "" ? null : Math.max(0, Math.round(Number(drip))),
        ...(type !== "video" && type !== "live" ? { duration_seconds: Math.max(0, Math.round(Number(minutes || 0) * 60)) } : {}),
        ...(type === "live" ? {
          starts_at: startsAt ? new Date(startsAt).toISOString() : null,
          live_minutes: Math.max(1, Math.round(Number(liveMinutes || 60))),
          zoom_meeting_id: (meetingId || zoomId(joinUrl) || "").replace(/\D/g, "") || null,
          ...(lesson.video?.status !== "ready" ? { duration_seconds: Math.max(1, Math.round(Number(liveMinutes || 60))) * 60 } : {}),
        } : {}),
      });
      if (type === "live" && joinUrl && !/^https:\/\/([a-z0-9-]+\.)*zoom\.us\//i.test(joinUrl)) { setMsg({ ok: false, t: "The join link should be a zoom.us link." }); return; }
      await saveLessonBody(courseId, lesson.id, {
        text, files, pass_pct: passPct, join_url: joinUrl.trim(),
        questions: questions.map((q) => ({ ...q, options: q.options.filter((o) => o.text.trim()) })),
      });
      setMsg({ ok: true, t: "Saved" });
      router.refresh();
    } catch (e) { setMsg({ ok: false, t: e instanceof Error ? e.message : "Could not save" }); }
  });

  return (
    <div className="mt-3 grid gap-4 rounded-card border border-line bg-surface p-4">
      <div className="grid gap-3 md:grid-cols-[1fr_160px]">
        <label className="grid gap-1 text-sm font-medium">Lesson title<input value={title} onChange={(e) => setTitle(e.target.value)} className="fc-input" /></label>
        <label className="grid gap-1 text-sm font-medium">Type
          <select value={type} onChange={(e) => setType(e.target.value)} className="fc-input">{TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</select>
        </label>
      </div>

      {type === "video" && (
        <div className="grid gap-2">
          <p className="text-sm font-medium">Video {lesson.video?.status === "ready" ? <span className="text-success">· uploaded and ready</span> : lesson.video ? <span className="text-muted">· {lesson.video.status.replace("_", " ")}</span> : null}</p>
          <p className="text-xs text-muted">{lesson.video_asset_id ? "Uploading a new file replaces the current video." : "Drag a video file here or choose one. MP4 or MOV recommended; large files are fine."}</p>
          <MuxUploader
            endpoint={async () => {
              const res = await fetch("/api/video/uploads", { method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ lessonId: lesson.id, title }) });
              const j = await res.json().catch(() => ({}));
              if (!res.ok) throw new Error(j.error ?? "Video upload isn't available — check the Mux settings.");
              return j.uploadUrl as string;
            }}
            onSuccess={() => { setMsg({ ok: true, t: "Uploaded — Mux is processing the video (usually a minute or two)." }); setTimeout(() => refreshCourse(courseId).then(() => router.refresh()), 5000); }}
          />
        </div>
      )}

      {type === "live" && (
        <div className="grid gap-3 rounded-md border border-line bg-bg p-3">
          <p className="text-sm font-medium">Live session on Zoom</p>
          <div className="grid gap-3 md:grid-cols-[1fr_140px]">
            <label className="grid gap-1 text-sm">Starts (your time: {Intl.DateTimeFormat().resolvedOptions().timeZone})
              <input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} className="fc-input" />
            </label>
            <label className="grid gap-1 text-sm">Length (minutes)<input value={liveMinutes} onChange={(e) => setLiveMinutes(e.target.value)} inputMode="numeric" className="fc-input" /></label>
          </div>
          <label className="grid gap-1 text-sm">Zoom join link (include the passcode)
            <input value={joinUrl} onChange={(e) => { setJoinUrl(e.target.value); const id = zoomId(e.target.value); if (id) setMeetingId(id); }}
              placeholder="https://us06web.zoom.us/j/85012345678?pwd=…" className="fc-input" />
          </label>
          <label className="grid gap-1 text-sm">Zoom meeting ID <span className="text-xs text-muted">Filled from the link. Used to bring the cloud recording in automatically.</span>
            <input value={meetingId} onChange={(e) => setMeetingId(e.target.value)} inputMode="numeric" className="fc-input" />
          </label>
          <p className="text-xs text-muted">Only enrolled students see the link, and only from 15 minutes before the start. Everyone sees the time in their own timezone and can add it to their calendar.</p>
          <div className="grid gap-2 border-t border-line pt-3">
            <p className="text-sm font-medium">Recording {lesson.video?.status === "ready" ? <span className="text-success">· ready, students can replay it</span> : lesson.video ? <span className="text-muted">· {lesson.video.status.replace("_", " ")}</span> : <span className="text-muted">· not yet</span>}</p>
            <p className="text-xs text-muted">With Zoom connected, the cloud recording is added here automatically after the session. Or upload the MP4 yourself:</p>
            <MuxUploader
              endpoint={async () => {
                const res = await fetch("/api/video/uploads", { method: "POST", headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ lessonId: lesson.id, title: `${title} (recording)` }) });
                const j = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(j.error ?? "Video upload isn't available. Check the Mux settings.");
                return j.uploadUrl as string;
              }}
              onSuccess={() => { setMsg({ ok: true, t: "Recording uploaded. Mux is processing it (usually a few minutes)." }); setTimeout(() => refreshCourse(courseId).then(() => router.refresh()), 5000); }}
            />
          </div>
        </div>
      )}

      {(type === "pdf" || type === "download" || type === "audio") && (
        <div className="grid gap-2">
          <p className="text-sm font-medium">Files students can download</p>
          {files.length > 0 && (
            <ul className="divide-y divide-line rounded-md border border-line bg-bg text-sm">
              {files.map((f) => (
                <li key={f.path} className="flex items-center justify-between gap-3 px-3 py-2">
                  <span className="truncate">{f.name}</span>
                  <button type="button" onClick={() => setFiles(files.filter((x) => x.path !== f.path))} className="text-xs text-danger underline">Remove</button>
                </li>
              ))}
            </ul>
          )}
          <FileUpload bucket="course-files" courseId={courseId} label="Upload a file" accept={type === "pdf" ? "application/pdf" : type === "audio" ? "audio/*" : undefined}
            onUploaded={(f) => setFiles((cur) => [...cur, { name: f.name, path: f.path }])} />
          <p className="text-xs text-muted">Files are private: enrolled students get a link that expires after an hour. Remember to save the lesson.</p>
        </div>
      )}

      {type === "quiz" && <QuizEditor questions={questions} setQuestions={setQuestions} passPct={passPct} setPassPct={setPassPct} />}

      <label className="grid gap-1 text-sm font-medium">{type === "text" ? "Lesson content" : "Notes shown with the lesson (optional)"}
        <textarea rows={type === "text" ? 10 : 4} value={text} onChange={(e) => setText(e.target.value)} className="fc-input" />
      </label>

      <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <label className="flex items-center gap-2"><input type="checkbox" checked={preview} onChange={(e) => setPreview(e.target.checked)} />Free preview (visible before purchase)</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} />Counts toward completion</label>
        <label className="flex items-center gap-2">Unlock after
          <input type="number" min={0} value={drip} onChange={(e) => setDrip(e.target.value)} placeholder="0" className="fc-input w-20 !py-1" />days</label>
        {type !== "video" && (
          <label className="flex items-center gap-2">Length
            <input type="number" min={0} value={minutes} onChange={(e) => setMinutes(e.target.value)} className="fc-input w-20 !py-1" />min</label>
        )}
      </div>

      <div className="flex items-center gap-3">
        <button disabled={pending} onClick={save} className="fc-btn fc-btn-primary">{pending ? "Saving…" : "Save lesson"}</button>
        <button onClick={onClose} className="text-sm text-muted underline">Close</button>
        {msg && <span className={`text-sm ${msg.ok ? "text-success" : "text-danger"}`}>{msg.t}</span>}
      </div>
    </div>
  );
}

const uid = () => Math.random().toString(36).slice(2, 8);

function QuizEditor({ questions, setQuestions, passPct, setPassPct }: {
  questions: QuizQuestionInput[]; setQuestions: (q: QuizQuestionInput[]) => void; passPct: number; setPassPct: (n: number) => void;
}) {
  const update = (i: number, q: QuizQuestionInput) => setQuestions(questions.map((x, k) => (k === i ? q : x)));
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-medium">Questions</p>
        <label className="flex items-center gap-2 text-sm">Pass mark
          <input type="number" min={0} max={100} value={passPct} onChange={(e) => setPassPct(Number(e.target.value))} className="fc-input w-20 !py-1" />%</label>
      </div>
      {questions.map((q, i) => (
        <div key={q.id} className="grid gap-2 rounded-md border border-line bg-bg p-3">
          <div className="flex gap-2">
            <span className="pt-2 text-sm font-semibold">{i + 1}.</span>
            <input value={q.prompt} onChange={(e) => update(i, { ...q, prompt: e.target.value })} placeholder="Question" className="fc-input flex-1" />
            <button type="button" onClick={() => setQuestions(questions.filter((_, k) => k !== i))} className="text-xs text-danger underline">Remove</button>
          </div>
          {q.options.map((o, oi) => (
            <div key={o.id} className="flex items-center gap-2 pl-6">
              <input type="radio" name={`correct-${q.id}`} checked={q.correct === o.id} onChange={() => update(i, { ...q, correct: o.id })} aria-label="Correct answer" />
              <input value={o.text} placeholder={`Answer ${oi + 1}`} className="fc-input flex-1 !py-1.5"
                onChange={(e) => update(i, { ...q, options: q.options.map((x) => (x.id === o.id ? { ...x, text: e.target.value } : x)) })} />
              {q.options.length > 2 && (
                <button type="button" aria-label="Remove answer" onClick={() => update(i, { ...q, options: q.options.filter((x) => x.id !== o.id), correct: q.correct === o.id ? "" : q.correct })} className="px-1 text-muted">×</button>
              )}
            </div>
          ))}
          <div className="flex gap-4 pl-6 text-xs">
            <button type="button" onClick={() => update(i, { ...q, options: [...q.options, { id: uid(), text: "" }] })} className="underline">+ Add answer</button>
            <span className="text-muted">Select the circle next to the correct answer.</span>
          </div>
        </div>
      ))}
      <button type="button" className="fc-btn fc-btn-outline justify-self-start !py-2 text-sm"
        onClick={() => setQuestions([...questions, { id: uid(), prompt: "", options: [{ id: uid(), text: "" }, { id: uid(), text: "" }], correct: "" }])}>
        + Add question
      </button>
    </div>
  );
}
