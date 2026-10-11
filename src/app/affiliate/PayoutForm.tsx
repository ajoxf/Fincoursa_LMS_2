"use client";
import { useActionState, useState } from "react";
import { savePayoutDetails, type ApplyState } from "./actions";

type Details = { method?: string; account_name?: string; bank_name?: string; iban?: string; swift?: string; email?: string; currency?: string };

export function PayoutForm({ details }: { details: Details }) {
  const [state, action, pending] = useActionState<ApplyState, FormData>(savePayoutDetails, null);
  const [method, setMethod] = useState(details.method ?? "bank_transfer");
  return (
    <form action={action} className="grid gap-3">
      <label className="grid gap-1 text-sm font-medium">Payout method
        <select name="method" value={method} onChange={(e) => setMethod(e.target.value)} className="fc-input">
          <option value="bank_transfer">Bank transfer (IBAN)</option><option value="paypal">PayPal</option><option value="wise">Wise</option>
        </select>
      </label>
      {method === "bank_transfer" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-sm font-medium">Account holder name<input name="account_name" defaultValue={details.account_name} className="fc-input" /></label>
          <label className="grid gap-1 text-sm font-medium">Bank name<input name="bank_name" defaultValue={details.bank_name} className="fc-input" /></label>
          <label className="grid gap-1 text-sm font-medium">IBAN<input name="iban" placeholder={details.iban ? `•••• ${details.iban.slice(-4)} (saved)` : "AE07 0331 2345 6789 0123 456"} className="fc-input" /></label>
          <label className="grid gap-1 text-sm font-medium">SWIFT / BIC<input name="swift" defaultValue={details.swift} className="fc-input uppercase" /></label>
        </div>
      ) : (
        <label className="grid gap-1 text-sm font-medium">Account email<input name="email" type="email" defaultValue={details.email} className="fc-input" /></label>
      )}
      <label className="grid max-w-40 gap-1 text-sm font-medium">Payout currency<input name="currency" defaultValue={details.currency ?? (process.env.NEXT_PUBLIC_DEFAULT_CURRENCY ?? "USD")} maxLength={3} className="fc-input uppercase" /></label>
      <div className="flex items-center gap-3">
        <button disabled={pending} className="fc-btn fc-btn-primary">{pending ? "Saving…" : "Save payout details"}</button>
        {state?.ok && <span className="text-sm text-success">Saved</span>}
        {state?.error && <span className="text-sm text-danger">{state.error}</span>}
      </div>
      <p className="text-xs text-muted">Only you and FinCoursa finance can see these details. Saved IBANs are shown masked.</p>
    </form>
  );
}
