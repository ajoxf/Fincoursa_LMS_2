import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { env } from "@/lib/env";
import { formatMoney } from "@/lib/money";
import { formatDate, nowIso } from "@/lib/format";
import { getCashbackSettings } from "@/lib/cashback";
import { Card } from "@/components/dash/Stat";
import { adjustCustomerCredit, saveCashbackSettings, saveItemCashback } from "./actions";

export const metadata: Metadata = { title: "Cashback & credit" };

type Grant = {
  id: string; currency: string; amount_minor: number; remaining_minor: number; source: string; note: string | null;
  expires_at: string | null; revoked_at: string | null; created_at: string; profile: { email: string | null; full_name: string | null } | null;
};
type Item = { id: string; title: string; cashback_percent: number | null };

export default async function AdminCredit({ searchParams }: PageProps<"/admin/credit">) {
  await requireRole(["admin", "finance"], "/admin/credit");
  const sp = await searchParams;
  const ok = typeof sp.ok === "string" ? sp.ok : null;
  const err = typeof sp.err === "string" ? sp.err : null;
  const db = createAdminClient();
  const [s, { data: grants }, { data: courses }, { data: bundles }, { data: prices }, { data: used }] = await Promise.all([
    getCashbackSettings(),
    db.from("credit_grants").select("id, currency, amount_minor, remaining_minor, source, note, expires_at, revoked_at, created_at, profile:profiles!credit_grants_user_id_fkey(email, full_name)")
      .order("created_at", { ascending: false }).limit(500),
    db.from("courses").select("id, title, cashback_percent").neq("status", "archived").order("title"),
    db.from("bundles").select("id, title, cashback_percent").neq("status", "archived").order("title"),
    db.from("prices").select("currency").eq("is_active", true),
    db.from("credit_redemptions").select("amount_minor, grant:credit_grants(currency)").is("reversed_at", null),
  ]);
  const list = (grants ?? []) as unknown as Grant[];
  const now = new Date(nowIso()).getTime();
  const live = (g: Grant) => !g.revoked_at && g.remaining_minor > 0 && (!g.expires_at || new Date(g.expires_at).getTime() > now);
  const currencies = [...new Set([env.defaultCurrency, ...(prices ?? []).map((p) => String(p.currency).toUpperCase())])].sort();

  // Totals per currency: issued, spent at checkout, still spendable (what you owe in future discounts)
  const totals = new Map<string, { issued: number; spent: number; open: number }>();
  const row = (c: string) => totals.get(c) ?? { issued: 0, spent: 0, open: 0 };
  for (const g of list) {
    const t = row(g.currency);
    totals.set(g.currency, { ...t, issued: t.issued + Number(g.amount_minor), open: t.open + (live(g) ? Number(g.remaining_minor) : 0) });
  }
  for (const r of (used ?? []) as unknown as { amount_minor: number; grant: { currency: string } | null }[]) {
    if (!r.grant) continue;
    const t = row(r.grant.currency);
    totals.set(r.grant.currency, { ...t, spent: t.spent + Number(r.amount_minor) });
  }

  const field = "fc-input";
  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-3xl font-bold text-primary">Cashback &amp; credit</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted">
          Buyers earn cashback as FinCoursa credit when an order is paid. Credit is kept in the order&apos;s currency and is applied
          automatically at their next checkout, before tax. A full refund cancels the order&apos;s unspent cashback and returns any credit it used.
          Each order keeps the cashback it was sold with, so changes here apply to new orders only.
        </p>
      </div>
      {ok && <p className="rounded-lg bg-success/10 p-3 text-sm text-success">{ok}</p>}
      {err && <p className="rounded-lg bg-danger/10 p-3 text-sm text-danger">{err}</p>}

      <Card title="Cashback rules">
        <form action={saveCashbackSettings} className="grid gap-4 text-sm">
          <label className="flex items-center gap-2 text-base font-medium">
            <input type="checkbox" name="enabled" defaultChecked={s.enabled} /> Cashback is {s.enabled ? <span className="text-success">on</span> : <span className="text-muted">off</span>}
          </label>
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="grid gap-1">Default cashback %
              <input name="percent" defaultValue={s.percent} inputMode="decimal" className={field} />
              <span className="text-xs text-muted">Of the amount paid, before tax. Courses can override it below.</span>
            </label>
            <label className="grid gap-1">Credit valid for (days)
              <input name="validity_days" defaultValue={s.validity_days ?? ""} inputMode="numeric" placeholder="No expiry" className={field} />
              <span className="text-xs text-muted">From the day it is earned. Leave empty for no expiry.</span>
            </label>
            <label className="grid gap-1">Most of an order credit can pay (%)
              <input name="max_redeem_pct" defaultValue={s.max_redeem_pct} inputMode="numeric" className={field} />
              <span className="text-xs text-muted">100 lets credit cover the whole price.</span>
            </label>
          </div>
          <label className="flex items-center gap-2"><input type="checkbox" name="allow_with_coupon" defaultChecked={s.allow_with_coupon} /> Credit can be used together with a discount code</label>
          <label className="flex items-center gap-2"><input type="checkbox" name="earn_on_credit" defaultChecked={s.earn_on_credit} /> Earn cashback on the part paid with credit too</label>
          <button className="fc-btn fc-btn-dark justify-self-start !min-w-0 !px-5 !py-2">Save rules</button>
        </form>
      </Card>

      <Card title="Cashback per course and programme">
        <p className="mb-3 text-sm text-muted">Leave empty to use the default ({s.percent}%). Enter 0 for no cashback on that item.</p>
        <div className="grid gap-1 text-sm">
          {[...((courses ?? []) as Item[]).map((c) => ({ ...c, kind: "course" })), ...((bundles ?? []) as Item[]).map((b) => ({ ...b, kind: "bundle" }))].map((it) => (
            <form key={`${it.kind}:${it.id}`} action={saveItemCashback} className="flex flex-wrap items-center gap-3 border-t border-line py-2">
              <input type="hidden" name="kind" value={it.kind} />
              <input type="hidden" name="id" value={it.id} />
              <span className="min-w-0 flex-1">{it.kind === "bundle" ? "Programme: " : ""}{it.title}</span>
              <span className="text-xs text-muted">{!s.enabled ? "Cashback off" : it.cashback_percent == null ? `Default ${s.percent}%` : `${Number(it.cashback_percent)}%`}</span>
              <input name="cashback_percent" defaultValue={it.cashback_percent ?? ""} placeholder="Default" inputMode="decimal" aria-label={`Cashback % for ${it.title}`} className="fc-input w-24 !py-1.5" />
              <button className="text-xs underline">Save</button>
            </form>
          ))}
        </div>
      </Card>

      <Card title="Credit outstanding">
        {totals.size ? (
          <div className="grid gap-2 text-sm sm:grid-cols-3">
            {[...totals.entries()].map(([c, t]) => (
              <div key={c} className="rounded-lg bg-surface p-4">
                <p className="text-xs uppercase tracking-wide text-muted">{c}</p>
                <p className="text-2xl font-bold tabular-nums">{formatMoney(t.open, c)}</p>
                <p className="text-xs text-muted">spendable · {formatMoney(t.issued, c)} issued · {formatMoney(t.spent, c)} used</p>
              </div>
            ))}
          </div>
        ) : <p className="text-sm text-muted">No credit issued yet.</p>}
      </Card>

      <Card title="Give or remove credit">
        <form action={adjustCustomerCredit} className="flex flex-wrap items-end gap-3 text-sm">
          <label className="grid gap-1">Customer email<input name="email" type="email" required className="fc-input w-64" /></label>
          <label className="grid gap-1">Currency
            <select name="currency" defaultValue={env.defaultCurrency} className="fc-input w-24">{currencies.map((c) => <option key={c}>{c}</option>)}</select>
          </label>
          <label className="grid gap-1">Amount<input name="amount" required inputMode="decimal" placeholder="e.g. 10 or -5" className="fc-input w-32" /></label>
          <label className="grid gap-1">Expires (optional)<input name="expires_at" type="date" className="fc-input" /></label>
          <label className="grid gap-1">Note shown to the customer<input name="note" maxLength={200} placeholder="e.g. Thanks for your review" className="fc-input w-64" /></label>
          <button className="fc-btn fc-btn-dark !min-w-0 !px-5 !py-2">Apply</button>
        </form>
        <p className="mt-2 text-xs text-muted">A negative amount removes spendable credit, soonest-expiring first.</p>
      </Card>

      <Card title={`Recent credit (${list.length})`}>
        {list.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-muted">
                <tr><th className="py-2 pr-3">Customer</th><th className="pr-3">Reason</th><th className="pr-3">Amount</th><th className="pr-3">Left</th><th className="pr-3">Expires</th><th className="pr-3">Added</th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {list.slice(0, 100).map((g) => (
                  <tr key={g.id} className={live(g) ? "" : "text-muted"}>
                    <td className="py-2 pr-3">{g.profile?.full_name || g.profile?.email || "—"}{g.profile?.full_name && <span className="block text-xs text-muted">{g.profile.email}</span>}</td>
                    <td className="py-2 pr-3">{g.note ?? g.source}{g.revoked_at ? " · cancelled" : ""}</td>
                    <td className="py-2 pr-3 tabular-nums">{formatMoney(g.amount_minor, g.currency)}</td>
                    <td className="py-2 pr-3 tabular-nums">{formatMoney(g.remaining_minor, g.currency)}</td>
                    <td className="py-2 pr-3">{g.expires_at ? formatDate(g.expires_at) : "Never"}</td>
                    <td className="py-2 pr-3">{formatDate(g.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="text-sm text-muted">No credit yet.</p>}
      </Card>
    </div>
  );
}
