"use client";
import { useState } from "react";

export function LinkBuilder({ base, code }: { base: string; code: string }) {
  const [path, setPath] = useState("/");
  const [copied, setCopied] = useState(false);
  const url = `${base}${path.startsWith("/") ? path : `/${path}`}${path.includes("?") ? "&" : "?"}ref=${code}`;
  return (
    <div className="grid gap-3">
      <label className="grid gap-1 text-sm font-medium">Page to link to
        <select value={path} onChange={(e) => setPath(e.target.value)} className="fc-input">
          <option value="/">Home page</option>
          <option value="/pages/paid-courses">All courses</option>
          <option value="/pages/bundles">Bundles</option>
          <option value="/pages/free-courses">Free courses</option>
        </select>
      </label>
      <div className="flex gap-2">
        <input readOnly value={url} className="fc-input font-mono text-xs" onFocus={(e) => e.target.select()} />
        <button className="fc-btn fc-btn-dark shrink-0" onClick={async () => { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <p className="text-xs text-muted">Add <code>?ref={code}</code> to any FinCoursa link, including individual course pages.</p>
    </div>
  );
}
