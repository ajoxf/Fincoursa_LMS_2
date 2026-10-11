"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { TIME_ZONE } from "@/lib/format";

export type NavLesson = { id: string; title: string; type: string; duration_seconds: number; done: boolean; locked: boolean; starts_at?: string | null };
export type NavChapter = { id: string; title: string; lessons: NavLesson[] };

const TYPE_LABEL: Record<string, string> = {
  video: "Video", text: "Text", quiz: "Quiz", pdf: "PDF", audio: "Audio", download: "Download", live: "Live",
};

function meta(l: NavLesson) {
  const parts = [TYPE_LABEL[l.type] ?? l.type];
  if (l.type === "live" && l.starts_at) parts.push(new Date(l.starts_at).toLocaleDateString("en-GB", { timeZone: TIME_ZONE, weekday: "short", day: "numeric", month: "short" }));
  else if (l.duration_seconds > 0) parts.push(l.duration_seconds < 60 ? "< 1 min" : `${Math.round(l.duration_seconds / 60)} min`);
  if (l.locked) parts.push("Locked");
  return parts.join(" · ").toUpperCase();
}

function TypeIcon({ type }: { type: string }) {
  const p = { width: 14, height: 14, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.3, "aria-hidden": true } as const;
  if (type === "video") return <svg {...p}><rect x="1.5" y="4" width="9" height="8" rx="1" /><path d="m10.5 7 4-2v6l-4-2" /></svg>;
  if (type === "quiz") return <svg {...p}><path d="M3 4h10M3 8h10M3 12h6" /></svg>;
  if (type === "live") return <svg {...p}><circle cx="8" cy="8" r="1.8" /><path d="M5 5a4.2 4.2 0 0 0 0 6M11 5a4.2 4.2 0 0 1 0 6M3 3a7 7 0 0 0 0 10M13 3a7 7 0 0 1 0 10" /></svg>;
  return <svg {...p}><path d="M4 1.5h5.5L12.5 4.5V14.5H4z" /><path d="M6 8h4.5M6 10.5h4.5" /></svg>;
}

function Ring({ done, size = 22 }: { done: boolean; size?: number }) {
  return done ? (
    <span className="flex shrink-0 items-center justify-center rounded-full bg-ink text-white" style={{ width: size, height: size }}>
      <svg width={size * 0.5} height={size * 0.5} viewBox="0 0 10 10" aria-hidden><path d="M2 5.2 4.1 7.2 8 3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </span>
  ) : (
    <span className="block shrink-0 rounded-full border-2 border-ink/70 bg-white" style={{ width: size, height: size }} />
  );
}

export function CurriculumNav({ slug, chapters, currentId }: { slug: string; chapters: NavChapter[]; currentId: string }) {
  const [q, setQ] = useState("");
  const currentChapter = chapters.find((c) => c.lessons.some((l) => l.id === currentId))?.id;
  const [open, setOpen] = useState<Record<string, boolean>>(() => (currentChapter ? { [currentChapter]: true } : {}));

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return chapters;
    return chapters
      .map((c) => ({ ...c, lessons: c.lessons.filter((l) => l.title.toLowerCase().includes(term)) }))
      .filter((c) => c.lessons.length > 0);
  }, [q, chapters]);

  return (
    <nav aria-label="Course contents">
      <label className="relative block">
        <span className="sr-only">Search by lesson title</span>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by lesson title"
          className="w-full rounded border border-ink/25 bg-transparent px-4 py-3 text-[15px] placeholder:text-ink/70 focus:border-ink focus:outline-none" />
        <svg className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2" width="16" height="16" viewBox="0 0 16 16" aria-hidden>
          <circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.5" /><path d="m10.5 10.5 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </label>

      <div className="mt-2">
        {filtered.map((ch) => {
          const done = ch.lessons.filter((l) => l.done).length;
          const isOpen = q ? true : Boolean(open[ch.id]);
          return (
            <div key={ch.id} className="border-b border-ink/15">
              <button onClick={() => setOpen((o) => ({ ...o, [ch.id]: !isOpen }))} aria-expanded={isOpen}
                className={`flex w-full items-start gap-4 py-5 text-left ${isOpen ? "border-b border-ink" : ""}`}>
                <Ring done={done === ch.lessons.length && ch.lessons.length > 0} size={26} />
                <span className="flex-1 text-[17px] font-semibold leading-snug text-ink">{ch.title}</span>
                <span className="pt-0.5 text-[15px] text-ink/80">{done}/{ch.lessons.length}</span>
                <svg className={`mt-1.5 transition ${isOpen ? "rotate-180" : ""}`} width="14" height="14" viewBox="0 0 14 14" aria-hidden>
                  <path d="m3 5 4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              {isOpen && (
                <ol className="relative -mx-4 py-1 md:-mx-4">
                  {ch.lessons.map((l, i) => {
                    const active = l.id === currentId;
                    return (
                      <li key={l.id} className="relative">
                        {i < ch.lessons.length - 1 && <span aria-hidden className="absolute left-[27px] top-[34px] h-[calc(100%-14px)] w-px bg-ink/40" />}
                        <Link href={`/learn/${slug}/${l.id}`} aria-current={active ? "page" : undefined}
                          className={`flex gap-4 px-4 py-3 ${active ? "bg-[#dfe1e5]" : "hover:bg-black/[.04]"}`}>
                          <span className="pt-1"><Ring done={l.done} size={16} /></span>
                          <span className="min-w-0 flex-1">
                            <span className={`block text-[15px] leading-snug ${active ? "font-semibold text-ink" : "text-ink/90"}`}>{l.title}</span>
                            <span className="mt-1 flex items-center gap-2 text-[11px] tracking-wide text-ink/70"><TypeIcon type={l.type} />{meta(l)}</span>
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>
          );
        })}
        {filtered.length === 0 && <p className="py-6 text-sm text-muted">No lessons match &ldquo;{q}&rdquo;.</p>}
      </div>
    </nav>
  );
}
