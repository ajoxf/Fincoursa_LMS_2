"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { approveCampaign, campaignRecipients, cancelCampaign, rejectCampaign, retryFailed, type AudiencePerson } from "./actions";
import { PeopleList } from "./PeopleList";
import { SendProgress } from "./Composer";

export function HistoryActions({ id, status, total, sent, failed, skipped, isAdmin }: { id: string; status: string; total: number; sent: number; failed: number; skipped: number; isAdmin: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [resume, setResume] = useState(false);
  const [approved, setApproved] = useState<{ id: string; total: number } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [list, setList] = useState<{ people: AudiencePerson[]; frozen: boolean } | "loading" | null>(null);
  const left = total - sent - failed - skipped;
  return (
    <div className="grid justify-items-start gap-2 text-xs md:justify-items-end">
      <div className="flex flex-wrap gap-3">
        {status === "awaiting_approval" && isAdmin && !approved && (
          <>
            <button disabled={pending} className="rounded-full bg-ink px-3 py-1 font-semibold text-white" onClick={() => start(async () => {
              const r = await approveCampaign(id);
              if (r?.campaignId) setApproved({ id: r.campaignId, total: r.total ?? 0 }); else { setMsg(r?.message ?? null); router.refresh(); }
            })}>Approve</button>
            <button disabled={pending} className="text-danger underline" onClick={() => { if (confirm("Reject this email? It won't be sent.")) start(async () => { await rejectCampaign(id); router.refresh(); }); }}>Reject</button>
          </>
        )}
        {status === "sending" && left > 0 && !resume && <button className="underline" onClick={() => setResume(true)}>Continue sending ({left} left)</button>}
        {isAdmin && failed > 0 && status !== "cancelled" && <button disabled={pending} className="underline" onClick={() => start(async () => { await retryFailed(id); setResume(true); })}>Retry {failed} failed</button>}
        {isAdmin && (status === "scheduled" || status === "sending") && (
          <button disabled={pending} className="text-danger underline" onClick={() => { if (confirm("Stop this email? People who already received it keep it.")) start(async () => { await cancelCampaign(id); router.refresh(); }); }}>
            {status === "scheduled" ? "Cancel" : "Stop"}
          </button>
        )}
        <button className="underline" onClick={() => { if (list) { setList(null); return; } setList("loading"); campaignRecipients(id).then(setList).catch(() => setList(null)); }}>{list ? "Hide recipients" : "Recipients"}</button>
        <Link href={`/admin/emails?from=${id}#compose`} className="underline">Reuse</Link>
      </div>
      {msg && <p className="text-success">{msg}</p>}
      {list === "loading" && <p className="text-muted">Loading…</p>}
      {list && list !== "loading" && <div className="w-full min-w-64 md:min-w-96"><PeopleList people={list.people} note={list.frozen ? undefined : "Not sent yet: these are the people it would go to today. The final list is fixed when it sends."} /></div>}
      {approved && <div className="w-full min-w-64"><SendProgress id={approved.id} total={approved.total} onDone={() => router.refresh()} /></div>}
      {resume && <div className="w-full min-w-64"><SendProgress id={id} total={total} onDone={() => router.refresh()} /></div>}
    </div>
  );
}
