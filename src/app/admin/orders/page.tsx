import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatMoney, minorUnitsFactor } from "@/lib/money";
import { markOrderPaid, refundOrder } from "../actions";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Orders" };

export default async function OrdersPage({ searchParams }: PageProps<"/admin/orders">) {
  await requireRole(["admin", "finance", "support"], "/admin/orders");
  const q = (await searchParams).q;
  const db = createAdminClient();
  let query = db.from("orders")
    .select("id, number, status, currency, total_minor, refunded_minor, gateway, billing_country, created_at, paid_at, user_id, user:profiles(email, full_name), order_items(title, course_id, bundle_id), affiliate:affiliates(code)")
    .order("created_at", { ascending: false }).limit(100);
  if (typeof q === "string" && /^\d+$/.test(q)) query = query.eq("number", Number(q));
  const { data: orders, error } = await query;
  // Same buyer paid for the same item twice within 24 hours: probably a duplicate payment to refund
  const dupes = new Set<string>();
  const paid = (orders ?? []).filter((o) => ["paid", "partially_refunded"].includes(o.status) && o.total_minor > 0);
  for (const o of paid) {
    const key = (x: typeof o) => x.order_items?.map((i) => i.course_id ?? i.bundle_id).sort().join(",");
    const earlier = paid.find((x) => x.id !== o.id && x.user_id === o.user_id && key(x) === key(o)
      && new Date(x.created_at) < new Date(o.created_at) && new Date(o.created_at).getTime() - new Date(x.created_at).getTime() < 864e5);
    if (earlier) dupes.add(o.id);
  }

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-bold text-primary">Orders &amp; refunds</h1>
        <form><input name="q" defaultValue={typeof q === "string" ? q : ""} placeholder="Order #" className="fc-input w-40" /></form>
      </div>
      {error && <p className="text-sm text-danger">{error.message}</p>}
      <div className="fc-card overflow-x-auto">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="text-left text-muted"><tr>
            {["#", "Date", "Buyer", "Item", "Gateway", "Affiliate", "Status", "Total", "Action"].map((h) => <th key={h} className="p-3 font-medium">{h}</th>)}
          </tr></thead>
          <tbody>
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {(orders ?? []).map((o: any) => {
              const refundable = (o.status === "paid" || o.status === "partially_refunded");
              const left = (o.total_minor - o.refunded_minor) / minorUnitsFactor(o.currency);
              return (
                <tr key={o.id} className="border-t border-line align-top">
                  <td className="p-3"><a href={`/api/invoices/${o.id}`} className="underline">{o.number}</a></td>
                  <td className="p-3">{formatDate(o.created_at)}</td>
                  <td className="p-3"><a href={`/admin/students/${o.user_id}`} className="hover:underline">{o.user?.full_name || o.user?.email}</a></td>
                  <td className="p-3">{o.order_items?.map((i: { title: string }) => i.title).join(", ")}</td>
                  <td className="p-3">{o.gateway}{o.billing_country && ` · ${o.billing_country}`}</td>
                  <td className="p-3">{o.affiliate?.code ?? "—"}</td>
                  <td className="p-3">{o.status}{dupes.has(o.id) && <div className="mt-1 inline-block rounded-full bg-warning/15 px-2 py-0.5 text-[11px] text-warning" title="The same buyer paid for the same item within 24 hours">Possible duplicate: refund?</div>}</td>
                  <td className="p-3 text-right tabular-nums">{formatMoney(o.total_minor, o.currency)}{o.refunded_minor > 0 && <div className="text-xs text-danger">−{formatMoney(o.refunded_minor, o.currency)}</div>}</td>
                  <td className="p-3">
                    {(o.status === "pending" || o.status === "failed") && o.total_minor > 0 && (
                      <details className="relative">
                        <summary className="cursor-pointer list-none text-xs font-medium text-success underline">Mark as paid…</summary>
                        <form action={markOrderPaid.bind(null, o.id)} className="absolute right-0 z-10 mt-2 grid w-64 gap-2 rounded-card border border-line bg-bg p-3 shadow-lg">
                          <p className="text-xs">Only after the money has arrived. FC-{o.number} · {formatMoney(o.total_minor, o.currency)}. The buyer is enrolled and emailed a receipt.</p>
                          <input name="reference" placeholder="Provider / bank reference (optional)" className="fc-input !py-1 text-xs" />
                          <button className="rounded-md border border-success px-2 py-1 text-xs text-success">Confirm payment received</button>
                        </form>
                      </details>
                    )}
                    {refundable && (
                      <details className="relative">
                        <summary className="cursor-pointer list-none text-xs font-medium text-danger underline">Refund…</summary>
                        <form action={refundOrder.bind(null, o.id)} className="absolute right-0 z-10 mt-2 grid w-56 gap-2 rounded-card border border-line bg-bg p-3 shadow-lg">
                          <label className="grid gap-1 text-xs">Amount ({o.currency})
                            <input name="amount" type="number" step="0.01" min="0.01" max={left} defaultValue={left} className="fc-input !py-1" />
                          </label>
                          <input name="reason" placeholder="Reason" className="fc-input !py-1 text-xs" />
                          <button className="rounded-md border border-danger px-2 py-1 text-xs text-danger">Confirm refund</button>
                        </form>
                      </details>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
