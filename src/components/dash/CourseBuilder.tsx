"use client";
import { useState, useTransition } from "react";
import MuxUploader from "@mux/mux-uploader-react";
import { addChapter, addLesson, deleteLesson, refreshCourse, saveLessonText, updateLesson } from "@/app/actions/curriculum";

type Lesson = { id: string; title: string; type: string; position: number; is_preview: boolean; video_asset_id: string | null; video: { status: string } | null; body?: { body: { text?: string } } | null };
type Chapter = { id: string; title: string; position: number; lessons: Lesson[] };

const TYPES = ["video", "text", "pdf", "download", "quiz"];

export function CourseBuilder({ courseId, chapters }: { courseId: string; chapters: Chapter[] }) {
  const [pending, start] = useTransition();
  const [chapterTitle, setChapterTitle] = useState("");
  const sorted = [...chapters].sort((a, b) => a.position - b.position);

  return (
    <div className={`grid gap-6 ${pending ? "opacity-60" : ""}`}>
      {sorted.map((ch) => (
        <div key={ch.id} className="rounded-card border border-line">
          <p className="border-b border-line bg-surface px-4 py-2 font-semibold">{ch.title}</p>
          <ul className="divide-y divide-line">
            {[...ch.lessons].sort((a, b) => a.position - b.position).map((l) => <LessonRow key={l.id} courseId={courseId} lesson={l} />)}
          </ul>
          <AddLesson onAdd={(title, type) => start(() => addLesson(courseId, ch.id, title, type))} />
        </div>
      ))}
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); start(async () => { await addChapter(courseId, chapterTitle); setChapterTitle(""); }); }}>
        <input value={chapterTitle} onChange={(e) => setChapterTitle(e.target.value)} placeholder="New chapter title" className="fc-input" />
        <button className="fc-btn fc-btn-dark shrink-0">Add chapter</button>
      </form>
    </div>
  );
}

function AddLesson({ onAdd }: { onAdd: (title: string, type: string) => void }) {
  const [title, setTitle] = useState("");
  const [type, setType] = useState("video");
  return (
    <form className="flex flex-wrap gap-2 p-3" onSubmit={(e) => { e.preventDefault(); onAdd(title, type); setTitle(""); }}>
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Lesson title" className="fc-input flex-1" />
      <select value={type} onChange={(e) => setType(e.target.value)} className="fc-input w-auto">{TYPES.map((t) => <option key={t}>{t}</option>)}</select>
      <button className="fc-btn fc-btn-outline">Add lesson</button>
    </form>
  );
}

function LessonRow({ courseId, lesson }: { courseId: string; lesson: Lesson }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(lesson.body?.body?.text ?? "");
  const [pending, start] = useTransition();
  const status = lesson.type === "video" ? (lesson.video?.status ?? "no video") : null;

  return (
    <li className="p-3">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="w-14 text-xs uppercase text-muted">{lesson.type}</span>
        <span className="flex-1 font-medium">{lesson.title}</span>
        {status && <span className={`text-xs ${status === "ready" ? "text-success" : "text-muted"}`}>{status.replace("_", " ")}</span>}
        <label className="flex items-center gap-1 text-xs">
          <input type="checkbox" defaultChecked={lesson.is_preview} disabled={pending}
            onChange={(e) => start(() => updateLesson(courseId, lesson.id, { is_preview: e.target.checked }))} />Free preview
        </label>
        <button onClick={() => setOpen(!open)} className="text-xs text-primary underline">{open ? "Close" : "Edit"}</button>
        <button disabled={pending} onClick={() => confirm("Delete this lesson? Student progress on it will be lost.") && start(() => deleteLesson(courseId, lesson.id))}
          className="text-xs text-danger underline">Delete</button>
      </div>
      {open && (
        <div className="mt-3 grid gap-3 rounded-card bg-surface p-3">
          {lesson.type === "video" && (
            <MuxUploader
              endpoint={async () => {
                const res = await fetch("/api/video/uploads", { method: "POST", headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ lessonId: lesson.id, title: lesson.title }) });
                if (!res.ok) throw new Error("Upload not allowed");
                return (await res.json()).uploadUrl as string;
              }}
              onSuccess={() => setTimeout(() => refreshCourse(courseId), 4000)}
            />
          )}
          <label className="grid gap-1 text-sm font-medium">Lesson text / notes
            <textarea rows={5} value={text} onChange={(e) => setText(e.target.value)} className="fc-input" placeholder="Shown under the video, or as the lesson itself for text lessons" />
          </label>
          <button disabled={pending} onClick={() => start(() => saveLessonText(courseId, lesson.id, text))} className="fc-btn fc-btn-dark justify-self-start">Save text</button>
          {lesson.type === "quiz" && <p className="text-xs text-muted">Quiz questions are edited as JSON for now (see docs/CONTENT.md).</p>}
        </div>
      )}
    </li>
  );
}
