"use client";
import { useActionState } from "react";
import { deleteBundle, type DeleteState } from "../actions";

export function DeleteBundle({ bundleId, title, orders, enrolments, codes }: {
  bundleId: string; title: string; orders: number; enrolments: number; codes: number;
}) {
  const [state, action, pending] = useActionState<DeleteState, FormData>(deleteBundle.bind(null, bundleId), null);
  if (orders > 0) {
    return (
      <p className="text-sm text-muted">
        This programme has {orders} order{orders === 1 ? "" : "s"}, so it can&apos;t be deleted: invoices and refunds still refer to it.
        To take it off the site, set <strong>Status</strong> to <strong>Archived</strong> above and save.
      </p>
    );
  }
  return (
    <form action={action} className="grid gap-3">
      <p className="text-sm">
        Deleting removes the programme and its price{codes > 0 ? `, plus ${codes} discount code${codes === 1 ? "" : "s"} that only apply to it` : ""}. The courses themselves are not touched.
        {enrolments > 0 && ` ${enrolments} student enrolment${enrolments === 1 ? "" : "s"} came through this programme; those students keep their courses.`}
        {" "}This can&apos;t be undone. To hide it but keep it, set Status to Archived instead.
      </p>
      <label className="grid gap-1 text-sm font-medium"><span>Type <span className="font-semibold">{title}</span> to confirm</span>
        <input name="confirm_title" required autoComplete="off" className="fc-input max-w-md" />
      </label>
      <div className="flex items-center gap-3">
        <button disabled={pending} className="fc-btn border border-danger bg-danger text-white hover:opacity-90">{pending ? "Deleting…" : "Delete programme"}</button>
        {state?.error && <span className="text-sm text-danger">{state.error}</span>}
      </div>
    </form>
  );
}
