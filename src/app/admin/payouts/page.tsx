import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatMoney } from "@/lib/money";
import { Card } from "@/components/dash/Stat";
import { cancelPayout, createPayouts, markPayoutPaid } from "../actions";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Payouts" };

export default async function AdminPayouts() {
  await requireRole(["admin", "finance"], "/admin/payouts");
  const db = createAdminClient();
  const [{ data: payouts }, { data: ie }, { data: ac }] = await Promise.all([
    db.from("payouts").select("id, payee_type, amount_minor, currency, status, method, reference, created_at, paid_at, instructor:instructors(name), affiliate:affiliates(code)").order("created_at", { ascending: false }).limit(100),
    db.from("instructor_earnings").select("amount_minor, currency").eq("status", "approved").is("payout_id", null),
    db.from("affiliate_commissions").select("amount_minor, currency").eq("status", "approved").is("payout_id", null),
  ]);
  const ready = [...(ie ?? []), ...(ac ?? [])].reduce((s, r) => s + Number(r.amount_minor), 0);

  return (
    <div className="grid gap-6">
      <h1 className="text-3xl font-bold text-primary">Payouts</h1>
      <Card title="Ready to pay">
        <p className="text-sm text-muted">Earnings become payable 30 days after the sale (after the refund window). {formatMoney(ready)} is ready across instructors and affiliates.</p>
        <form action={createPayouts} className="mt-4"><button disabled={ready <= 0} className="fc-btn fc-btn-primary">Create payout batch</button></form>
      </Card>
      <div className="fc-card overflow-x-auto">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="text-left text-muted"><tr>
            {["Created", "Payee", "Amount", "Status", "Action"].map((h) => <th key={h} className="p-3 font-medium">{h}</th>)}
          </tr></thead>
          <tbody>
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {(payouts ?? []).map((p: any) => (
              <tr key={p.id} className="border-t border-line">
                <td className="p-3">{formatDate(p.created_at)}</td>
                <td className="p-3">{p.payee_type === "instructor" ? p.instructor?.name : `Affiliate ${p.affiliate?.code}`}</td>
                <td className="p-3 tabular-nums">{formatMoney(p.amount_minor, p.currency)}</td>
                <td className="p-3">{p.status}{p.reference && <span className="text-muted"> · {p.reference}</span>}</td>
                <td className="p-3">
                  {p.status === "draft" && (
                    <form className="flex gap-1">
                      <input name="reference" placeholder="Transfer reference" className="fc-input w-40 !py-1" />
                      <button formAction={markPayoutPaid.bind(null, p.id)} className="rounded-md border border-success px-2 text-xs text-success">Mark paid</button>
                      <button formAction={cancelPayout.bind(null, p.id)} className="rounded-md border border-line px-2 text-xs">Cancel</button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
            {!payouts?.length && <tr><td colSpan={5} className="p-6 text-center text-muted">No payouts yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
