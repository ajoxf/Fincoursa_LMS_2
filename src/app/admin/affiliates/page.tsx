import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/format";
import { partnerCodesEnabled } from "@/lib/env";
import { Stat } from "@/components/dash/Stat";
import { createAffiliateCoupon, setAffiliateStatus } from "../actions";

export const metadata: Metadata = { title: "Affiliates & IBs" };

/* eslint-disable @typescript-eslint/no-explicit-any */
export default async function AdminAffiliates() {
  await requireRole(["admin"], "/admin/affiliates");
  const db = createAdminClient();
  const [{ data: affs }, { data: stats }, { data: coupons }] = await Promise.all([
    db.from("affiliates").select("id, code, status, commission_pct, override_pct, cookie_days, parent_affiliate_id, website, notes, created_at, approved_at, payout_details, user:profiles!affiliates_user_id_fkey(email, full_name)").order("created_at", { ascending: false }),
    (await createClient()).rpc("admin_affiliate_stats"),
    db.from("coupons").select("code, percent_off, redeemed_count, affiliate_id, is_active").not("affiliate_id", "is", null),
  ]);
  const list = (affs ?? []) as any[];
  const byId = new Map(list.map((a) => [a.id, a]));
  type S = { clicks: number; clients: number; sales: number; revenue: number; owed: number; override: number };
  const st = new Map<string, S>((stats ?? []).map((r: any) => [r.affiliate_id, {
    clicks: Number(r.clicks), clients: Number(r.clients), sales: Number(r.sales), revenue: Number(r.revenue_minor), owed: Number(r.owed_minor), override: Number(r.override_minor),
  }]));
  const totals = [...st.values()].reduce((a, s) => ({ revenue: a.revenue + s.revenue, owed: a.owed + s.owed }), { revenue: 0, owed: 0 });

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-3xl font-bold text-primary">Affiliates &amp; Introducing Brokers</h1>
        <p className="mt-1 text-sm text-muted">Each sale is credited to one partner through one route: their referral link{partnerCodesEnabled ? ", or their partner code if no link was used" : ""}.</p>
      </div>
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <Stat label="Active partners" value={list.filter((a) => a.status === "approved").length} />
        <Stat label="Awaiting approval" value={list.filter((a) => a.status === "pending").length} />
        <Stat label="Revenue from partners" value={formatMoney(totals.revenue)} hint="excl. VAT, all time" />
        <Stat label="Unpaid commission" value={formatMoney(totals.owed)} />
      </div>
      <div className="grid gap-3">
        {list.map((a) => {
          const s = st.get(a.id) ?? { clicks: 0, clients: 0, sales: 0, revenue: 0, owed: 0, override: 0 };
          const parent = a.parent_affiliate_id ? byId.get(a.parent_affiliate_id) : null;
          const subs = list.filter((x) => x.parent_affiliate_id === a.id).length;
          const myCoupons = (coupons ?? []).filter((c) => c.affiliate_id === a.id);
          return (
            <details key={a.id} className="fc-card group" open={a.status === "pending"}>
              <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-6 gap-y-2 p-4 text-sm">
                <span className="min-w-48 flex-1">
                  <span className="font-semibold">{a.user?.full_name || a.user?.email}</span>
                  <span className="ml-2 font-mono text-xs">{a.code}</span>
                  {subs > 0 && <span className="ml-2 rounded-button bg-accent/20 px-2 py-0.5 text-[11px] font-semibold">Master IB · {subs} sub-IBs</span>}
                  {parent && <span className="ml-2 rounded-button bg-surface px-2 py-0.5 text-[11px]">Sub-IB of {parent.code}</span>}
                </span>
                <span className="tabular-nums">{s.clicks} clicks</span>
                <span className="tabular-nums">{s.clients} clients</span>
                <span className="tabular-nums">{s.sales} sales</span>
                <span className="tabular-nums">{formatMoney(s.revenue)} referred</span>
                <span className="tabular-nums font-medium">{formatMoney(s.owed)} unpaid</span>
                <span className={`rounded-button px-2 py-0.5 text-xs font-semibold ${a.status === "approved" ? "bg-success/15 text-success" : a.status === "pending" ? "bg-warning/15 text-warning" : "bg-danger/10 text-danger"}`}>{a.status}</span>
              </summary>
              <div className="grid gap-4 border-t border-line p-4 lg:grid-cols-2">
                <div className="grid content-start gap-2 text-sm">
                  <p><span className="text-muted">Email:</span> {a.user?.email}</p>
                  {a.website && <p><span className="text-muted">Website:</span> {a.website}</p>}
                  {a.notes && <p><span className="text-muted">Application:</span> {a.notes}</p>}
                  <p><span className="text-muted">Applied:</span> {formatDate(a.created_at)}{a.approved_at && ` · approved ${formatDate(a.approved_at)}`}</p>
                  <p><span className="text-muted">Payout details:</span> {a.payout_details?.method ? `${a.payout_details.method.replace("_", " ")}${a.payout_details.iban ? ` · IBAN •••• ${a.payout_details.iban.slice(-4)}` : ""}${a.payout_details.email ? ` · ${a.payout_details.email}` : ""}` : <span className="text-warning">not provided</span>}</p>
                  {s.override > 0 && <p><span className="text-muted">Override earned from sub-IBs:</span> {formatMoney(s.override)}</p>}
                  {partnerCodesEnabled && (
                  <div className="mt-2">
                      <p className="font-medium">Coupon codes</p>
                      {myCoupons.length ? <ul className="mt-1 text-xs">{myCoupons.map((c) => <li key={c.code}><span className="font-mono font-semibold">{c.code}</span> · {Number(c.percent_off)}% off · used {c.redeemed_count}×{!c.is_active && " · inactive"}</li>)}</ul> : <p className="text-xs text-muted">None yet.</p>}
                      <form action={createAffiliateCoupon.bind(null, a.id)} className="mt-2 flex flex-wrap gap-2">
                        <input name="code" placeholder={`${a.code}10`} className="fc-input w-32 !py-1.5 uppercase" />
                        <input name="percent_off" type="number" min={1} max={100} placeholder="% off" className="fc-input w-20 !py-1.5" />
                        <input name="max_redemptions" type="number" min={1} placeholder="Max uses" className="fc-input w-24 !py-1.5" />
                        <input name="ends_at" type="date" className="fc-input w-40 !py-1.5" />
                        <button className="rounded-md border border-line px-3 text-xs font-medium">Create code</button>
                      </form>
                    </div>
                  )}
                </div>
                <form className="grid content-start gap-3 rounded-md bg-surface p-4 text-sm">
                  <div className="grid grid-cols-3 gap-3">
                    <label className="grid gap-1 text-xs font-medium">Commission %<input name="commission_pct" type="number" min={0} max={100} step="0.5" defaultValue={a.commission_pct} className="fc-input !py-1.5" /></label>
                    <label className="grid gap-1 text-xs font-medium">Cookie days<input name="cookie_days" type="number" min={1} defaultValue={a.cookie_days} className="fc-input !py-1.5" /></label>
                    <label className="grid gap-1 text-xs font-medium">Master IB code<input name="parent_code" defaultValue={parent?.code ?? ""} placeholder="none" className="fc-input !py-1.5 uppercase" /></label>
                  </div>
                  <label className="grid gap-1 text-xs font-medium">Override % the master IB earns on this partner&apos;s sales
                    <input name="override_pct" type="number" min={0} max={100} step="0.5" defaultValue={a.override_pct} className="fc-input w-28 !py-1.5" /></label>
                  <div className="flex gap-2">
                    <button formAction={setAffiliateStatus.bind(null, a.id, "approved")} className="fc-btn fc-btn-primary !px-4 !py-2 text-sm">{a.status === "approved" ? "Save" : "Approve"}</button>
                    {a.status !== "suspended" && <button formAction={setAffiliateStatus.bind(null, a.id, "suspended")} className="fc-btn fc-btn-outline !px-4 !py-2 text-sm text-danger">Suspend</button>}
                  </div>
                </form>
              </div>
            </details>
          );
        })}
        {!list.length && <p className="fc-card p-6 text-center text-sm text-muted">No affiliate applications yet.</p>}
      </div>
    </div>
  );
}
