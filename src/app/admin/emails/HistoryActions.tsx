"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { cancelCampaign, retryFailed } from "./actions";
import { SendProgress } from "./Composer";

export function HistoryActions({ id, status, total, sent, failed, skipped }: { id: string; status: string; total: number; sent: number; failed: number; skipped: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [resume, setResume] = useState(false);
  const left = total - sent - failed - skipped;
  return (
    <div className="grid justify-items-start gap-2 text-xs md:justify-items-end">
      <div className="flex flex-wrap gap-3">
        {status === "sending" && left > 0 && !resume && <button className="underline" onClick={() => setResume(true)}>Continue sending ({left} left)</button>}
        {failed > 0 && status !== "cancelled" && <button disabled={pending} className="underline" onClick={() => start(async () => { await retryFailed(id); setResume(true); })}>Retry {failed} failed</button>}
        {(status === "scheduled" || status === "sending") && (
          <button disabled={pending} className="text-danger underline" onClick={() => { if (confirm("Stop this email? People who already received it keep it.")) start(async () => { await cancelCampaign(id); router.refresh(); }); }}>
            {status === "scheduled" ? "Cancel" : "Stop"}
          </button>
        )}
        <Link href={`/admin/emails?from=${id}#compose`} className="underline">Reuse</Link>
      </div>
      {resume && <div className="w-full min-w-64"><SendProgress id={id} total={total} onDone={() => router.refresh()} /></div>}
    </div>
  );
}
