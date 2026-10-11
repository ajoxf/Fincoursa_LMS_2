"use client";
import { useActionState } from "react";
import { inviteAffiliate, type InviteState } from "./actions";

export function InviteAffiliateForm({ codesEnabled }: { codesEnabled: boolean }) {
  const [state, action, pending] = useActionState<InviteState, FormData>(inviteAffiliate, null);
  return (
    <form action={action} key={state?.ok ? state.message : "invite"} className="grid gap-3">
      <div className="grid gap-3 md:grid-cols-[1fr_1fr_130px]">
        <label className="grid gap-1 text-sm font-medium">Name<input name="name" required maxLength={120} className="fc-input" /></label>
        <label className="grid gap-1 text-sm font-medium">Email<input name="email" type="email" required className="fc-input" /></label>
        <label className="grid gap-1 text-sm font-medium">Commission %<input name="commission_pct" type="number" min={0} max={100} step="0.5" defaultValue={20} className="fc-input" /></label>
      </div>
      <details className="text-sm">
        <summary className="cursor-pointer text-muted">More options: their code, master IB</summary>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <label className="grid gap-1 text-sm font-medium">Referral code <span className="font-normal text-muted">(blank: made from their first name)</span>
            <input name="code" maxLength={30} placeholder="e.g. OMAR" className="fc-input uppercase" /></label>
          <label className="grid gap-1 text-sm font-medium">Master IB code <span className="font-normal text-muted">(if they sit under another partner)</span>
            <input name="parent_code" maxLength={30} placeholder="none" className="fc-input uppercase" /></label>
        </div>
      </details>
      <div className="flex flex-wrap items-center gap-3">
        <button disabled={pending} className="fc-btn fc-btn-primary !py-2.5">{pending ? "Inviting…" : "Invite partner"}</button>
        {state && <span className={`text-sm ${state.error ? "text-danger" : "text-success"}`}>{state.error ?? state.message}</span>}
      </div>
      <p className="text-xs text-muted">They&apos;re approved straight away and get one email with their {codesEnabled ? "code, " : ""}referral link, commission and a button to set up their account. If they already have a FinCoursa account, it&apos;s used.</p>
    </form>
  );
}
