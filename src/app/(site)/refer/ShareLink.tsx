"use client";
import { useState } from "react";

export function ShareLink({ url, message }: { url: string; message: string }) {
  const [copied, setCopied] = useState(false);
  const text = `${message} ${url}`;
  const copy = async () => { try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* ignore */ } };
  const btn = "fc-btn fc-btn-outline !min-w-0 !px-4 !py-2 text-sm text-ink";
  return (
    <div className="fc-card grid gap-4 p-6">
      <p className="text-sm font-semibold text-ink">Your link</p>
      <div className="flex flex-wrap gap-2">
        <input readOnly value={url} className="fc-input min-w-0 flex-1 font-mono text-sm" onFocus={(e) => e.currentTarget.select()} />
        <button type="button" onClick={copy} className="fc-btn fc-btn-primary !min-w-0 !px-5 !py-2 text-sm">{copied ? "Copied" : "Copy link"}</button>
      </div>
      <div className="flex flex-wrap gap-2">
        <a className={btn} target="_blank" rel="noopener noreferrer" href={`https://wa.me/?text=${encodeURIComponent(text)}`}>Share on WhatsApp</a>
        <a className={btn} target="_blank" rel="noopener noreferrer" href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`}>Share on LinkedIn</a>
        <a className={btn} href={`mailto:?subject=${encodeURIComponent("CMT Level II practice questions")}&body=${encodeURIComponent(text)}`}>Send by email</a>
      </div>
    </div>
  );
}
