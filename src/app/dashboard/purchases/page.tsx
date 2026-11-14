import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/format";
import { creditFor, getCashbackSettings } from "@/lib/cashback";

export const metadata: Metadata = { title: "Purchases" };

const statusLabel: Record<string, string> = {
  paid: "Paid", pending: "Pending", failed: "Failed", cancelled: "Cancelled", refunded: "Refunded", partially_refunded: "Partly refunded",
};

export default async function PurchasesPage() {
  const user = await requireUser("/dashboard/purchases");
  const { data: orders } = await (await createClient())
    .from("orders")
    .select("id, number, status, currency, total_minor, tax_minor, refunded_minor, paid_at, created_at, order_items(title)")
    .eq("user_id", user.id).neq("status", "pending").order("created_at", { ascending: false });
  const [{ balances, grants, nextExpiry }, cb] = await Promise.all([creditFor(user.id), getCashbackSettings()]);
  const currencies = Object.keys(balances);

  return (
    <div>
      <h1 className="text-3xl font-bold text-primary">Purchases</h1>
      {(currencies.length > 0 || cb.enabled) && (
        <div className="fc-card mt-6 grid gap-3 p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-semibold">FinCoursa credit</h2>
            <p className="text-2xl font-bold tabular-nums">
              {currencies.length ? currencies.map((c) => formatMoney(balances[c], c)).join(" · ") : formatMoney(0)}
            </p>
          </div>
          <p className="text-sm text-muted">
            {cb.enabled ? "Earn cashback as credit on purchases. " : ""}
            Credit is used automatically at checkout{cb.max_redeem_pct < 100 ? ` (up to ${cb.max_redeem_pct}% of an order)` : ""} in the currency it was earned in.
            {currencies.filter((c) => nextExpiry[c]).map((c) => ` Some ${c} credit expires on ${formatDate(nextExpiry[c]!)}.`).join("")}
          </p>
          {grants.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer text-primary">Credit history</summary>
              <ul className="mt-2 divide-y divide-line">
                {grants.slice(0, 30).map((g) => (
                  <li key={g.id} className="flex justify-between gap-3 py-2">
                    <span>{g.note ?? (g.source === "cashback" ? "Cashback" : "Credit")} · {formatDate(g.created_at)}
                      {g.revoked_at ? " · cancelled" : g.expires_at ? ` · ${new Date(g.expires_at) < new Date() ? "expired" : "expires"} ${formatDate(g.expires_at)}` : ""}</span>
                    <span className="tabular-nums text-muted">{formatMoney(g.remaining_minor, g.currency)} left of {formatMoney(g.amount_minor, g.currency)}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
      <div className="fc-card mt-6 overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="text-left text-muted"><tr>
            <th className="p-4 font-medium">Order</th><th className="p-4 font-medium">Item</th><th className="p-4 font-medium">Date</th>
            <th className="p-4 font-medium">Status</th><th className="p-4 text-right font-medium">Total</th><th className="p-4" />
          </tr></thead>
          <tbody>
            {(orders ?? []).map((o) => (
              <tr key={o.id} className="border-t border-line">
                <td className="p-4">#{o.number}</td>
                <td className="p-4">{o.order_items?.map((i) => i.title).join(", ")}</td>
                <td className="p-4">{formatDate(o.paid_at ?? o.created_at)}</td>
                <td className="p-4">{statusLabel[o.status] ?? o.status}</td>
                <td className="p-4 text-right tabular-nums">{formatMoney(o.total_minor, o.currency)}</td>
                <td className="p-4 text-right">{o.status !== "failed" && <a href={`/api/invoices/${o.id}`} className="text-primary underline">Invoice</a>}</td>
              </tr>
            ))}
            {!orders?.length && <tr><td colSpan={6} className="p-8 text-center text-muted">No purchases yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
