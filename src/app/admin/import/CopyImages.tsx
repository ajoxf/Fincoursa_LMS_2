"use client";
import { useState, useTransition } from "react";
import { copyThinkificImages, type ImageCopyResult } from "./actions";

export function CopyImages() {
  const [res, setRes] = useState<ImageCopyResult | null>(null);
  const [pending, start] = useTransition();
  return (
    <section className="fc-card grid gap-3 p-5">
      <h2 className="text-lg font-semibold text-primary">Copy images from Thinkific</h2>
      <p className="text-sm text-muted">
        Instructor photos, organisation logos and course images that still point at Thinkific are copied into FinCoursa&apos;s own storage.
        Do this before cancelling Thinkific, or those images disappear. Nothing changes on Thinkific. Safe to run again.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <button disabled={pending} className="fc-btn fc-btn-primary" onClick={() => start(async () => setRes(await copyThinkificImages()))}>
          {pending ? "Copying…" : "Copy images now"}
        </button>
        {res && <span className="text-sm">{res.copied} copied · {res.failed.length} failed{res.remaining ? ` · ${res.remaining} left (run again)` : ""}</span>}
      </div>
      {res && res.failed.length > 0 && (
        <ul className="text-xs text-danger">{res.failed.map((f) => <li key={f.url} className="break-all">{f.reason}: {f.url}</li>)}</ul>
      )}
    </section>
  );
}
