import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/money";

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

  return (
    <div>
      <h1 className="text-3xl font-bold text-primary">Purchases</h1>
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
                <td className="p-4">{new Date(o.paid_at ?? o.created_at).toLocaleDateString()}</td>
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
