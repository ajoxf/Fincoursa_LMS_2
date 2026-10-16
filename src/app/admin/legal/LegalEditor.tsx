"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Markdown } from "@/components/site/Markdown";
import { FileUpload } from "@/components/dash/FileUpload";
import type { LegalDoc, LegalKind } from "@/lib/legal";
import { importLegalFile, saveLegal, setLegalPdf } from "./actions";

const fmt = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "";

export function LegalEditor({ kind, title, path, doc }: { kind: LegalKind; title: string; path: string; doc: LegalDoc }) {
  const router = useRouter();
  const [text, setText] = useState(doc.body);
  const [saved, setSaved] = useState(doc.body);
  const [view, setView] = useState<"edit" | "preview">("edit");
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [pending, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const dirty = text.trim() !== saved.trim();

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (dirty) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const publish = () => start(async () => {
    setMsg(null);
    const r = await saveLegal(kind, text);
    if (!r.ok) { setMsg({ ok: false, t: r.error ?? "Could not save" }); return; }
    setSaved(text); setMsg({ ok: true, t: "Published. The page is updated." }); router.refresh();
  });

  const importFile = (f: File) => start(async () => {
    setMsg(null);
    if (text.trim() && !confirm("Replace the text in the editor with this file? Nothing is published until you click Publish.")) return;
    const fd = new FormData(); fd.append("file", f);
    const r = await importLegalFile(fd);
    if (!r.ok || r.text === undefined) { setMsg({ ok: false, t: r.error ?? "Couldn't read that file" }); return; }
    setText(r.text); setView("preview");
    setMsg({ ok: true, t: `Imported "${f.name}". Check the preview, fix anything that looks off, then click Publish.` });
  });

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <p className="text-muted">
          {doc.updated_at ? <>Last published {fmt(doc.updated_at)}{doc.by ? ` by ${doc.by}` : ""}.</> : "Not published yet: the page shows a short \"being updated\" note."}
          {" "}<a href={path} target="_blank" rel="noopener noreferrer" className="text-ink underline">View page</a>
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <input ref={fileRef} type="file" accept=".docx,.txt,.md" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) importFile(f); e.target.value = ""; }} />
          <button type="button" disabled={pending} onClick={() => fileRef.current?.click()} className="fc-btn fc-btn-outline !px-4 !py-2 text-sm">Import from Word (.docx)</button>
        </div>
      </div>

      <div className="flex gap-1 rounded-md bg-surface p-1 text-sm sm:w-fit">
        {(["edit", "preview"] as const).map((v) => (
          <button key={v} type="button" onClick={() => setView(v)}
            className={`flex-1 rounded px-4 py-1.5 sm:flex-none ${view === v ? "bg-white font-semibold shadow-sm" : "text-muted"}`}>{v === "edit" ? "Edit" : "Preview"}</button>
        ))}
      </div>

      {view === "edit" ? (
        <div className="grid gap-2">
          <textarea value={text} onChange={(e) => { setText(e.target.value); setMsg(null); }} rows={24} spellCheck
            placeholder={`## 1. Introduction\n\nThese terms apply to…\n\n## 2. Your account\n\n- You must…\n- You may…`}
            className="fc-input min-h-[420px] font-mono text-[13px] leading-relaxed" aria-label={`${title} text`} />
          <p className="text-xs text-muted">
            Formatting: start a line with <code>## </code> for a heading, <code>- </code> for a bullet, <code>1. </code> for a numbered point.
            Leave an empty line between paragraphs. <code>**bold**</code>, links as <code>[text](https://…)</code> or just paste the web address.
          </p>
        </div>
      ) : (
        <div className="min-h-[200px] rounded-card border border-line bg-white p-6">
          {text.trim() ? <Markdown text={text} /> : <p className="text-sm text-muted">Nothing to preview yet.</p>}
        </div>
      )}

      <div className="sticky bottom-0 -mx-5 flex flex-wrap items-center gap-3 border-t border-line bg-white/95 px-5 py-3 backdrop-blur">
        <button type="button" disabled={pending || !dirty} onClick={publish} className="fc-btn fc-btn-primary disabled:opacity-50">
          {pending ? "Working…" : dirty ? `Publish ${title}` : "Published"}
        </button>
        {dirty && <button type="button" onClick={() => { setText(saved); setMsg(null); }} className="text-sm text-muted underline">Discard changes</button>}
        {msg && <span className={`text-sm ${msg.ok ? "text-success" : "text-danger"}`}>{msg.t}</span>}
      </div>

      <div className="grid gap-2 rounded-card border border-line p-4 text-sm">
        <p className="font-medium">PDF version (optional)</p>
        <p className="text-xs text-muted">Upload a PDF and the page shows a &ldquo;Download PDF&rdquo; link next to the date. Keep it in step with the text above.</p>
        {doc.pdf_url ? (
          <div className="flex flex-wrap items-center gap-4">
            <a href={doc.pdf_url} target="_blank" rel="noopener noreferrer" className="underline">{doc.pdf_name ?? "Current PDF"}</a>
            <FileUpload bucket="site-files" courseId={`legal-${kind}`} accept="application/pdf" label="Replace PDF"
              onUploaded={async (f) => { if (f.publicUrl) { await setLegalPdf(kind, { url: f.publicUrl, name: f.name }); router.refresh(); } }} />
            <button type="button" className="text-xs text-danger underline" onClick={() => start(async () => { await setLegalPdf(kind, null); router.refresh(); })}>Remove PDF</button>
          </div>
        ) : (
          <FileUpload bucket="site-files" courseId={`legal-${kind}`} accept="application/pdf" label="Upload PDF"
            onUploaded={async (f) => { if (f.publicUrl) { await setLegalPdf(kind, { url: f.publicUrl, name: f.name }); router.refresh(); } }} />
        )}
      </div>

      {!!doc.history?.length && (
        <details className="rounded-card border border-line p-4 text-sm">
          <summary className="cursor-pointer font-medium">Earlier versions ({doc.history.length})</summary>
          <p className="mt-2 text-xs text-muted">Kept for your records. &ldquo;Load into editor&rdquo; copies an old version into the editor; it&apos;s only live once you Publish.</p>
          <ul className="mt-3 divide-y divide-line">
            {doc.history.map((h, i) => (
              <li key={i} className="flex flex-wrap items-center justify-between gap-3 py-2">
                <span>{fmt(h.updated_at)}{h.by ? ` · ${h.by}` : ""} · {h.body.length.toLocaleString()} characters</span>
                <button type="button" className="underline" onClick={() => { if (!dirty || confirm("Replace your unsaved changes with this version?")) { setText(h.body); setView("preview"); setMsg({ ok: true, t: `Loaded the version from ${fmt(h.updated_at)}. Publish to make it live again.` }); } }}>
                  Load into editor
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
