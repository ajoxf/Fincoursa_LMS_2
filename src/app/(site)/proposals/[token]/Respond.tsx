"use client";
import { useActionState } from "react";
import { respondToProposal, type RespondState } from "./actions";

function One({ token, choice, label, primary }: { token: string; choice: "pilot" | "accept"; label: string; primary?: boolean }) {
  const [state, action, pending] = useActionState<RespondState, FormData>(respondToProposal.bind(null, token, choice), null);
  if (state?.ok) return <p className="rounded-lg bg-surface p-4 text-[15px] text-ink">{state.message}</p>;
  return (
    <form action={action} className="grid gap-2">
      <textarea name="note" rows={2} placeholder="Anything we should know? (optional)" className="w-full rounded-lg bg-surface px-4 py-3 text-[15px] text-ink" />
      {state?.error && <p className="text-sm text-danger">{state.error}</p>}
      <button disabled={pending} className={`fc-btn ${primary ? "fc-btn-primary" : "fc-btn-outline text-ink"} justify-self-start`}>{pending ? "Sending…" : label}</button>
    </form>
  );
}

export function Respond({ token, pilotSeats, pilotDays }: { token: string; pilotSeats: number; pilotDays: number }) {
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div className="grid content-start gap-3">
        <p className="font-semibold text-ink">Start with a free pilot</p>
        <p className="text-[15px] text-ink/80">{pilotSeats} people, full access for {pilotDays} days, at no cost.</p>
        <One token={token} choice="pilot" label="Request the free pilot" primary />
      </div>
      <div className="grid content-start gap-3">
        <p className="font-semibold text-ink">Go ahead with the proposal</p>
        <p className="text-[15px] text-ink/80">We&apos;ll confirm the details and send an invoice.</p>
        <One token={token} choice="accept" label="Accept the proposal" />
      </div>
    </div>
  );
}
