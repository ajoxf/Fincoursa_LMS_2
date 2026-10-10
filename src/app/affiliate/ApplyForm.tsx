"use client";
import { useActionState } from "react";
import { applyAsAffiliate, type ApplyState } from "./actions";

export function ApplyForm() {
  const [state, action, pending] = useActionState<ApplyState, FormData>(applyAsAffiliate, null);
  return (
    <form action={action} className="fc-card grid max-w-lg gap-4 p-6">
      <label className="grid gap-1 text-sm font-medium">Your referral code<input name="code" required className="fc-input uppercase" placeholder="e.g. ALI20" /></label>
      <label className="grid gap-1 text-sm font-medium">Website or social profile<input name="website" className="fc-input" /></label>
      <label className="grid gap-1 text-sm font-medium">How will you promote FinCoursa?<textarea name="notes" rows={4} className="fc-input" /></label>
      {state?.error && <p className="text-sm text-danger">{state.error}</p>}
      <button disabled={pending} className="fc-btn fc-btn-primary justify-self-start">{pending ? "Submitting…" : "Apply"}</button>
    </form>
  );
}
