"use client";
import { useActionState, useState, useTransition } from "react";
import type { CustomGatewayRow } from "@/lib/payments/types";
import { createCustomProvider, deleteCustomProvider, updateCustomProvider, type CustomState } from "./custom-actions";

const PLACEHOLDERS = "{amount}, {currency}, {order_number}, {order_id}, {email}, {amount_minor}";

function Fields({ row }: { row?: CustomGatewayRow }) {
  return (
    <>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="grid gap-1 text-sm font-medium">Provider name
          <input name="name" defaultValue={row?.name} required maxLength={60} placeholder="e.g. Ziina, PayTabs, Bank transfer" className="fc-input" />
        </label>
        <label className="grid gap-1 text-sm font-medium">Button text buyers see
          <input name="label" defaultValue={row?.label} maxLength={80} placeholder="Pay with Ziina" className="fc-input" />
        </label>
      </div>
      <label className="grid gap-1 text-sm font-medium">Payment link (optional)
        <input name="pay_url" defaultValue={row?.pay_url ?? ""} maxLength={1000} placeholder="https://pay.example.com/fincoursa?amount={amount}&ref={order_number}" className="fc-input font-mono text-[13px]" />
        <span className="text-xs font-normal text-muted">The provider&apos;s payment page or payment-link URL. You can insert: {PLACEHOLDERS}.</span>
      </label>
      <label className="grid gap-1 text-sm font-medium">Instructions for the buyer (optional)
        <textarea name="instructions" defaultValue={row?.instructions ?? ""} rows={3} maxLength={2000}
          placeholder="e.g. Pay by bank transfer to: FinCoursa Academy FZ-LLC, IBAN AE00 0000 0000 0000, and use your order reference." className="fc-input" />
      </label>
      <label className="grid gap-1 text-sm font-medium">Currencies (optional)
        <input name="currencies" defaultValue={row?.currencies?.join(", ") ?? ""} placeholder="Any currency, or e.g. AED, USD" className="fc-input uppercase" />
      </label>
    </>
  );
}

function Msg({ s }: { s: CustomState }) {
  return s ? <p role="status" className={`rounded-lg px-3 py-2 text-sm ${s.ok ? "bg-success/10 text-success" : "bg-danger/10 text-danger"}`}>{s.message}</p> : null;
}

/** Edit form shown inside a custom provider's card. */
export function CustomDetails({ row }: { row: CustomGatewayRow }) {
  const [state, action, saving] = useActionState(updateCustomProvider.bind(null, row.id), null);
  const [pending, start] = useTransition();
  return (
    <form action={action} className="mt-4 grid gap-3 border-t border-line pt-4">
      <Fields row={row} />
      <Msg s={state} />
      <div className="flex flex-wrap items-center gap-3">
        <button disabled={saving} className="fc-btn fc-btn-primary !min-w-0 !px-5 !py-2.5 text-sm">{saving ? "Saving…" : "Save details"}</button>
        <button type="button" disabled={pending} className="text-sm text-danger underline"
          onClick={() => { if (confirm(`Delete ${row.name}? Its routes are removed too. Past orders keep their history.`)) start(() => deleteCustomProvider(row.id)); }}>
          Delete provider
        </button>
      </div>
    </form>
  );
}

/** "Add another payment provider" without code. */
export function AddCustomProvider() {
  const [open, setOpen] = useState(false);
  const [state, action, saving] = useActionState(createCustomProvider, null);
  return (
    <div className="rounded-card border border-dashed border-line p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-semibold">Add any other payment provider</p>
          <p className="mt-0.5 max-w-xl text-xs text-muted">
            For any provider that gives you a payment link or payment page (Ziina, PayTabs, Telr pay-by-link, Paymob, Stripe Payment Links…),
            or for bank transfer. Payments are confirmed by you on the Orders page, or automatically by webhook.
          </p>
        </div>
        <button type="button" onClick={() => setOpen((o) => !o)} className="fc-btn fc-btn-primary !min-w-0 !px-4 !py-2 text-sm">{open ? "Close" : "+ Add provider"}</button>
      </div>
      {open && (
        <form action={action} className="mt-4 grid gap-3 border-t border-line pt-4">
          <Fields />
          <Msg s={state} />
          <div><button disabled={saving} className="fc-btn fc-btn-primary !min-w-0 !px-5 !py-2.5 text-sm">{saving ? "Adding…" : "Add provider"}</button></div>
        </form>
      )}
    </div>
  );
}
