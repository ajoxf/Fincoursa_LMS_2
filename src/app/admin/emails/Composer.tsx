"use client";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { countAudience, createCampaign, previewEmail, sendNextBatch, sendTestEmail, type ComposeState } from "./actions";

type Course = { id: string; title: string };
type Draft = { kind?: "promotion" | "update"; subject?: string; heading?: string; body?: string; cta_label?: string | null; cta_url?: string | null; courses?: string[]; countries?: string[]; buyers_only?: boolean };

/** Sends the remaining batches one after another and shows progress. */
export function SendProgress({ id, total, onDone }: { id: string; total: number; onDone?: () => void }) {
  const [p, setP] = useState({ sent: 0, failed: 0, skipped: 0, pending: total });
  const [err, setErr] = useState<string | null>(null);
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      try {
        for (let guard = 0; guard < 10000; guard++) {
          const r = await sendNextBatch(id);
          setP({ sent: r.sent, failed: r.failed, skipped: r.skipped, pending: r.pending });
          if (r.pending === 0 || r.status === "cancelled") break;
        }
        onDone?.();
      } catch (e) { setErr((e as Error).message); }
    })();
  }, [id, onDone]);
  const done = total - p.pending;
  const pct = total ? Math.round((done / total) * 100) : 100;
  return (
    <div className="grid gap-2 rounded-xl border border-line p-4">
      <div className="flex justify-between text-sm"><b>{p.pending ? "Sending… keep this page open" : "Finished"}</b><span className="tabular-nums">{done} / {total}</span></div>
      <div className="h-2 rounded-full bg-surface"><div className="h-2 rounded-full bg-accent transition-all" style={{ width: `${pct}%` }} /></div>
      <p className="text-xs text-muted">{p.sent} sent{p.skipped ? ` · ${p.skipped} not delivered (no email provider connected)` : ""}{p.failed ? ` · ${p.failed} failed (you can retry below)` : ""}</p>
      {err && <p className="text-xs text-danger">Stopped: {err}. Use “Continue sending” below to resume.</p>}
    </div>
  );
}

export function Composer({ courses, draft, consenting }: { courses: Course[]; draft?: Draft; consenting: number }) {
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const [kind, setKind] = useState<"promotion" | "update">(draft?.kind ?? "promotion");
  const [count, setCount] = useState<number | null>(null);
  const [state, action, saving] = useActionState<ComposeState, FormData>(createCampaign, null);
  const [test, setTest] = useState<ComposeState>(null);
  const [preview, setPreview] = useState<{ html?: string; subject?: string; error?: string } | null>(null);
  const [pending, start] = useTransition();
  const [mode, setMode] = useState<"now" | "schedule">("now");

  // live audience size
  const recount = () => {
    if (!form.current) return;
    const fd = new FormData(form.current);
    const audience = {
      courses: fd.getAll("courses").map(String),
      countries: String(fd.get("countries") ?? "").toUpperCase().split(/[^A-Z]+/).filter((c) => c.length === 2),
      buyers_only: fd.get("buyers_only") === "on",
    };
    countAudience(fd.get("kind") === "update" ? "update" : "promotion", audience).then(setCount).catch(() => setCount(null));
  };
  useEffect(recount, [kind]);

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    if (mode === "now" && !confirm(`Send this email to ${count ?? "all matching"} people now?`)) e.preventDefault();
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[1.1fr_1fr]">
      <form ref={form} action={action} onSubmit={submit} onChange={(e) => { if ((e.target as HTMLElement).closest("[data-audience]")) recount(); }} className="grid content-start gap-5">
        <fieldset className="grid gap-2">
          <legend className="mb-2 text-sm font-semibold">1 · Type of email</legend>
          <label className="flex cursor-pointer gap-3 rounded-lg border border-line p-3 has-[:checked]:border-ink">
            <input type="radio" name="kind" value="promotion" checked={kind === "promotion"} onChange={() => setKind("promotion")} className="mt-1 accent-black" />
            <span><b className="text-sm">Newsletter or promotion</b><span className="block text-xs text-muted">Weekly updates, new courses, offers. Only goes to people who agreed to marketing emails ({consenting} today), with an unsubscribe link.</span></span>
          </label>
          <label className="flex cursor-pointer gap-3 rounded-lg border border-line p-3 has-[:checked]:border-ink">
            <input type="radio" name="kind" value="update" checked={kind === "update"} onChange={() => setKind("update")} className="mt-1 accent-black" />
            <span><b className="text-sm">Important update for students</b><span className="block text-xs text-muted">Service messages only (a session moved, new content in a course they own, a change to their access). Goes to everyone in the audience. Don&apos;t use it for offers.</span></span>
          </label>
        </fieldset>

        <fieldset data-audience className="grid gap-3">
          <legend className="mb-2 text-sm font-semibold">2 · Who gets it</legend>
          <div className="grid gap-1 text-sm">
            <span className="font-medium">Students of these courses <span className="font-normal text-muted">(none ticked = everyone)</span></span>
            <div className="grid max-h-44 gap-1 overflow-y-auto rounded-lg border border-line p-3">
              {courses.map((c) => (
                <label key={c.id} className="flex items-center gap-2"><input type="checkbox" name="courses" value={c.id} defaultChecked={draft?.courses?.includes(c.id)} />{c.title}</label>
              ))}
            </div>
          </div>
          <label className="grid gap-1 text-sm font-medium">Only these countries <span className="font-normal text-muted">(2-letter codes, e.g. AE, SA, IN; blank = all)</span>
            <input name="countries" defaultValue={draft?.countries?.join(", ") ?? ""} placeholder="All countries" className="fc-input uppercase" />
          </label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="buyers_only" defaultChecked={draft?.buyers_only} /> Only people who have bought something</label>
          <p className="rounded-lg bg-surface px-3 py-2 text-sm">This will go to <b>{count ?? "…"}</b> {count === 1 ? "person" : "people"}.</p>
        </fieldset>

        <fieldset className="grid gap-3">
          <legend className="mb-2 text-sm font-semibold">3 · Message</legend>
          <label className="grid gap-1 text-sm font-medium">Subject line<input name="subject" required maxLength={150} defaultValue={draft?.subject} placeholder="This week at FinCoursa: …" className="fc-input" /></label>
          <label className="grid gap-1 text-sm font-medium">Heading inside the email <span className="font-normal text-muted">(optional, defaults to the subject)</span>
            <input name="heading" maxLength={150} defaultValue={draft?.heading} placeholder="Hi {first_name}, here's what's new" className="fc-input" /></label>
          <label className="grid gap-1 text-sm font-medium">Message
            <textarea name="body" required rows={10} defaultValue={draft?.body} className="fc-input" placeholder={"Write as you would a normal email.\n\nLeave a blank line between paragraphs. Links like https://fincoursa.com/... become clickable.\n{first_name} is replaced with each student's first name."} />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-sm font-medium">Button text <span className="font-normal text-muted">(optional)</span><input name="cta_label" maxLength={40} defaultValue={draft?.cta_label ?? ""} placeholder="Register now" className="fc-input" /></label>
            <label className="grid gap-1 text-sm font-medium">Button link<input name="cta_url" defaultValue={draft?.cta_url ?? ""} placeholder="https://… or /courses/…" className="fc-input" /></label>
          </div>
        </fieldset>

        <fieldset className="grid gap-3">
          <legend className="mb-2 text-sm font-semibold">4 · Send</legend>
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2"><input type="radio" name="mode" value="now" checked={mode === "now"} onChange={() => setMode("now")} /> Send now</label>
            <label className="flex items-center gap-2"><input type="radio" name="mode" value="schedule" checked={mode === "schedule"} onChange={() => setMode("schedule")} /> Schedule</label>
          </div>
          {mode === "schedule" && (
            <label className="grid gap-1 text-sm font-medium">Send on
              <input type="date" name="send_on" min={new Date().toISOString().slice(0, 10)} className="fc-input w-56" />
              <span className="text-xs font-normal text-muted">Goes out around 5:00 AM UAE time on that day.</span>
            </label>
          )}
          <div className="flex flex-wrap gap-3">
            <button type="button" disabled={pending} onClick={() => form.current && start(async () => setPreview(await previewEmail(new FormData(form.current!))))}
              className="fc-btn fc-btn-outline !min-w-0 !px-4 !py-2.5 text-sm text-ink">Preview</button>
            <button type="button" disabled={pending} onClick={() => form.current && start(async () => setTest(await sendTestEmail(new FormData(form.current!))))}
              className="fc-btn fc-btn-outline !min-w-0 !px-4 !py-2.5 text-sm text-ink">Send me a test</button>
            <button disabled={saving || state?.campaignId !== undefined} className="fc-btn fc-btn-primary !min-w-0 !px-5 !py-2.5 text-sm">
              {saving ? "Saving…" : mode === "now" ? `Send to ${count ?? "…"} people` : "Schedule"}
            </button>
          </div>
          {test && <p className={`text-sm ${test.ok ? "text-success" : "text-danger"}`}>{test.message}</p>}
          {state && !state.campaignId && <p className={`text-sm ${state.ok ? "text-success" : "text-danger"}`}>{state.message}</p>}
          {state?.campaignId && <SendProgress id={state.campaignId} total={state.total ?? 0} onDone={() => router.refresh()} />}
        </fieldset>
      </form>

      <div className="grid content-start gap-2 xl:sticky xl:top-24">
        <p className="text-sm font-semibold">Preview</p>
        {preview?.error && <p className="text-sm text-danger">{preview.error}</p>}
        {preview?.html ? (
          <>
            <p className="text-xs text-muted">Subject: <b className="text-ink">{preview.subject}</b></p>
            <iframe title="Email preview" srcDoc={preview.html} sandbox="" className="h-[640px] w-full rounded-xl border border-line bg-white" />
          </>
        ) : <p className="rounded-xl border border-dashed border-line p-8 text-center text-sm text-muted">Press Preview to see the email as students will.</p>}
      </div>
    </div>
  );
}
