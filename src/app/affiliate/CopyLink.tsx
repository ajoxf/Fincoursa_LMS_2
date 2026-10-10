"use client";
import { useState } from "react";

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" className="fc-btn fc-btn-dark shrink-0 !px-4 !py-2 text-sm"
      onClick={async () => { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500); }}>
      {done ? "Copied" : label}
    </button>
  );
}

/** Build a tracked link to any page, with an optional campaign tag (?sub=). */
export function LinkBuilder({ base, code, courses }: { base: string; code: string; courses: { slug: string; title: string }[] }) {
  const [path, setPath] = useState("/");
  const [campaign, setCampaign] = useState("");
  const tag = campaign.replace(/[^A-Za-z0-9_-]/g, "").toLowerCase();
  const url = `${base}${path}?ref=${code}${tag ? `&sub=${tag}` : ""}`;
  return (
    <div className="grid gap-3">
      <div className="grid gap-3 md:grid-cols-2">
        <label className="grid gap-1 text-sm font-medium">Page to link to
          <select value={path} onChange={(e) => setPath(e.target.value)} className="fc-input">
            <option value="/">Home page</option>
            <option value="/pages/paid-courses">All courses</option>
            <option value="/pages/bundles">Bundles</option>
            <option value="/pages/free-courses">Free courses</option>
            {courses.map((c) => <option key={c.slug} value={`/courses/${c.slug}`}>Course: {c.title}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-medium">Campaign tag (optional)
          <input value={campaign} onChange={(e) => setCampaign(e.target.value)} placeholder="e.g. youtube, telegram, webinar-oct" className="fc-input" />
        </label>
      </div>
      <div className="flex gap-2">
        <input readOnly value={url} className="fc-input font-mono text-xs" onFocus={(e) => e.target.select()} />
        <CopyButton text={url} />
      </div>
      <p className="text-xs text-muted">Tag each channel differently to see which one brings sales in the Campaigns table below.</p>
    </div>
  );
}
