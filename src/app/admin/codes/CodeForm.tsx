"use client";
import { useActionState, useState } from "react";
import { createCode, type CodeFormState } from "./actions";

type Opt = { id: string; title: string };

export function CodeForm({ courses, bundles, currencies, defaultCurrency }: {
  courses: Opt[]; bundles: Opt[]; currencies: string[]; defaultCurrency: string;
}) {
  const [state, action, pending] = useActionState<CodeFormState, FormData>(createCode, null);
  const [kind, setKind] = useState<"percent" | "amount">("percent");
  return (
    <form action={action} key={state?.ok ? state.code : "form"} className="grid gap-4">
      <div className="grid gap-4 md:grid-cols-3">
        <label className="grid gap-1 text-sm font-medium">Code
          <input name="code" required minLength={3} maxLength={40} placeholder="e.g. CMTL2LAUNCH" className="fc-input font-mono uppercase" />
          <span className="text-xs font-normal text-muted">Letters, numbers, - and _. Students type it at checkout.</span>
        </label>
        <label className="grid gap-1 text-sm font-medium">Discount type
          <select name="kind" value={kind} onChange={(e) => setKind(e.target.value as "percent" | "amount")} className="fc-input">
            <option value="percent">Percentage off</option>
            <option value="amount">Fixed amount off</option>
          </select>
        </label>
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <label className="grid gap-1 text-sm font-medium">{kind === "percent" ? "Percent off" : "Amount off"}
            <input name="value" type="number" required min={kind === "percent" ? 1 : 0.01} max={kind === "percent" ? 100 : undefined} step="0.01"
              placeholder={kind === "percent" ? "e.g. 20" : "e.g. 50"} className="fc-input" />
          </label>
          {kind === "amount" && (
            <label className="grid gap-1 text-sm font-medium">Currency
              <select name="currency" defaultValue={defaultCurrency} className="fc-input">
                {currencies.map((c) => <option key={c}>{c}</option>)}
              </select>
            </label>
          )}
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-4">
        <label className="grid gap-1 text-sm font-medium md:col-span-2">Applies to
          <select name="applies_to" defaultValue="all" className="fc-input">
            <option value="all">Every course and programme</option>
            {courses.length > 0 && <optgroup label="One course">{courses.map((c) => <option key={c.id} value={`course:${c.id}`}>{c.title}</option>)}</optgroup>}
            {bundles.length > 0 && <optgroup label="One programme">{bundles.map((b) => <option key={b.id} value={`bundle:${b.id}`}>{b.title}</option>)}</optgroup>}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-medium">Starts (optional)<input name="starts_at" type="date" className="fc-input" /></label>
        <label className="grid gap-1 text-sm font-medium">Ends (optional)<input name="ends_at" type="date" className="fc-input" /></label>
      </div>
      <div className="flex flex-wrap items-end gap-4">
        <label className="grid gap-1 text-sm font-medium">Usage limit (optional)
          <input name="max_redemptions" type="number" min={1} step={1} placeholder="Unlimited" className="fc-input w-40" />
        </label>
        <button disabled={pending} className="fc-btn fc-btn-primary">{pending ? "Creating…" : "Create code"}</button>
        {state?.ok && <span className="text-sm text-success">Code <span className="font-mono font-semibold">{state.code}</span> created.</span>}
        {state?.error && <span className="text-sm text-danger">{state.error}</span>}
      </div>
      <p className="text-xs text-muted">Dates are in UTC: a code starts at 00:00 on its start date and stops at 23:59 on its end date. Codes for affiliates are still created on the Affiliates page so their sales are credited.</p>
    </form>
  );
}
