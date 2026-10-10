import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatMoney } from "@/lib/money";
import { setAffiliateStatus } from "../actions";

export const metadata: Metadata = { title: "Affiliates" };

export default async function AdminAffiliates() {
  await requireRole(["admin"], "/admin/affiliates");
  const db = createAdminClient();
  const [{ data: affs }, { data: comm }, { data: clicks }] = await Promise.all([
    db.from("affiliates").select("id, code, status, commission_pct, website, notes, created_at, user:profiles(email, full_name)").order("created_at", { ascending: false }),
    db.from("affiliate_commissions").select("affiliate_id, amount_minor, net_revenue_minor, status, currency"),
    db.from("affiliate_clicks").select("affiliate_id"),
  ]);
  const stats = new Map<string, { clicks: number; sales: number; revenue: number; owed: number }>();
  const get = (id: string) => stats.get(id) ?? stats.set(id, { clicks: 0, sales: 0, revenue: 0, owed: 0 }).get(id)!;
  (clicks ?? []).forEach((c) => get(c.affiliate_id).clicks++);
  (comm ?? []).filter((c) => c.status !== "reversed").forEach((c) => {
    const s = get(c.affiliate_id); s.sales++; s.revenue += Number(c.net_revenue_minor);
    if (c.status !== "paid") s.owed += Number(c.amount_minor);
  });

  return (
    <div className="grid gap-6">
      <h1 className="text-3xl font-bold text-primary">Affiliates</h1>
      <div className="fc-card overflow-x-auto">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="text-left text-muted"><tr>
            {["Affiliate", "Code", "Clicks", "Sales", "Revenue referred", "Unpaid commission", "Status / commission %"].map((h) => <th key={h} className="p-3 font-medium">{h}</th>)}
          </tr></thead>
          <tbody>
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {(affs ?? []).map((a: any) => {
              const s = stats.get(a.id) ?? { clicks: 0, sales: 0, revenue: 0, owed: 0 };
              return (
                <tr key={a.id} className="border-t border-line align-top">
                  <td className="p-3">{a.user?.full_name || a.user?.email}<div className="text-xs text-muted">{a.website}</div>{a.notes && <div className="mt-1 max-w-xs text-xs text-muted">{a.notes}</div>}</td>
                  <td className="p-3 font-mono">{a.code}</td>
                  <td className="p-3 tabular-nums">{s.clicks}</td>
                  <td className="p-3 tabular-nums">{s.sales}</td>
                  <td className="p-3 tabular-nums">{formatMoney(s.revenue)}</td>
                  <td className="p-3 tabular-nums">{formatMoney(s.owed)}</td>
                  <td className="p-3">
                    <form className="flex items-center gap-1">
                      <span className="w-20 text-xs">{a.status}</span>
                      <input name="commission_pct" type="number" min="0" max="100" step="0.5" defaultValue={a.commission_pct} className="fc-input w-16 !py-1" />
                      <button formAction={setAffiliateStatus.bind(null, a.id, "approved")} className="rounded-md border border-success px-2 text-xs text-success">{a.status === "approved" ? "Save" : "Approve"}</button>
                      {a.status !== "suspended" && <button formAction={setAffiliateStatus.bind(null, a.id, "suspended")} className="rounded-md border border-danger px-2 text-xs text-danger">Suspend</button>}
                    </form>
                  </td>
                </tr>
              );
            })}
            {!affs?.length && <tr><td colSpan={7} className="p-6 text-center text-muted">No affiliate applications yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
