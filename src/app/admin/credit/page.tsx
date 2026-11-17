import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { env } from "@/lib/env";
import { formatMoney, minorUnitsFactor } from "@/lib/money";
import { formatDate, nowIso } from "@/lib/format";
import { cashbackLabel, cashbackRule, getCashbackSettings, type CashbackRule } from "@/lib/cashback";
import { Card } from "@/components/dash/Stat";
import { adjustCustomerCredit, saveCashbackSettings, saveItemCashback, saveReferralSettings } from "./actions";
import { getReferralSettings } from "@/lib/referral";
import { addSplit, allCashbackGrants, emptySplit, splitGrant, type CashbackSplit } from "@/lib/cashback-status";
import { monthKey, monthLabel } from "@/lib/instructor-statement";

export const metadata: Metadata = { title: "Cashback & credit" };

type Grant = {
  id: string; currency: string; amount_minor: number; remaining_minor: number; source: string; note: string | null;
  expires_at: string | null; revoked_at: string | null; created_at: string; profile: { email: string | null; full_name: string | null } | null;
};
type Item = { id: string; title: string; cashback_mode: "none" | "percent" | "fixed" | null; cashback_percent: number | null; cashback_fixed: Record<string, number> | null };

/** "10%" or "$10.00 · ₹800.00" for a rule across the currencies sold in */
const describe = (rule: CashbackRule | null, currencies: string[]) =>
  !rule ? "No cashback" : rule.mode === "percent" ? `${cashbackLabel(rule, "USD")} of amount paid`
    : currencies.map((c) => cashbackLabel(rule, c)).filter(Boolean).join(" · ") || "No cashback";
/** minor units → the number shown in an amount box */
const major = (minor: number | undefined, c: string) => (minor ? String(minor / minorUnitsFactor(c)) : "");

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
    db.from("courses").select("id, title, cashback_mode, cashback_percent, cashback_fixed").neq("status", "archived").order("title"),
    db.from("bundles").select("id, title, cashback_mode, cashback_percent, cashback_fixed").neq("status", "archived").order("title"),
    db.from("prices").select("currency").eq("is_active", true),
    db.from("credit_redemptions").select("amount_minor, grant:credit_grants(currency)").is("reversed_at", null),
  ]);
  const [referral, cbGrants] = await Promise.all([getReferralSettings(), allCashbackGrants(db)]);
  const { data: pending } = await db.from("course_reviews")
    .select("id, user_id, rating, review, created_at, course:courses(title), order:orders(number), profile:profiles!course_reviews_user_id_fkey(email, full_name)")
    .eq("status", "pending").order("created_at");
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

  // Cashback lifecycle: where every cashback credit stands now (used / open / expired / cancelled by refund)
  const cbCur = new Map<string, CashbackSplit & { nextExpiry: string | null }>();
  const cbMonth = new Map<string, CashbackSplit>(); // key "YYYY-MM|CUR"
  const expiredList: { id: string; who: string; currency: string; amount: number; given: number; on: string }[] = [];
  for (const g of cbGrants) {
    const sp = splitGrant(g, now);
    const cur = cbCur.get(g.currency) ?? { ...emptySplit(), nextExpiry: null };
    const nextExpiry = sp.open > 0 && g.expires_at && (!cur.nextExpiry || g.expires_at < cur.nextExpiry) ? g.expires_at : cur.nextExpiry;
    cbCur.set(g.currency, { ...addSplit(cur, sp), nextExpiry });
    const mk = `${monthKey(g.created_at)}|${g.currency}`;
    cbMonth.set(mk, addSplit(cbMonth.get(mk) ?? emptySplit(), sp));
    if (sp.expired > 0) expiredList.push({ id: g.id, who: g.profile?.full_name || g.profile?.email || "Customer", currency: g.currency, amount: sp.expired, given: sp.given, on: g.expires_at! });
  }
  expiredList.sort((a, b) => b.on.localeCompare(a.on));
  const months = [...cbMonth.entries()].sort((a, b) => b[0].localeCompare(a[0])).slice(0, 24);

  const field = "fc-input";
  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-3xl font-bold text-primary">Cashback &amp; Credit</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted">
          Buyers earn cashback as FinCoursa credit when an order is paid. Credit is kept in the order&apos;s currency and is applied
          automatically at their next checkout, before tax. A full refund cancels the order&apos;s unspent cashback and returns any credit it used.
          Each order keeps the cashback it was sold with, so changes here apply to new orders only.
        </p>
      </div>
      {ok && <p className="rounded-lg bg-success/10 p-3 text-sm text-success">{ok}</p>}
      {err && <p className="rounded-lg bg-danger/10 p-3 text-sm text-danger">{err}</p>}

      <Card title="Refer a friend">
        <form action={saveReferralSettings} className="grid gap-3 text-sm">
          <p className="text-muted">Anyone with an account gets a personal link at <Link href="/refer" className="underline">fincoursa.com/refer</Link>. When a friend opens it and buys within 30 days,
            the person who shared it gets this % of what the friend paid (before tax) as credit, usable for the same time as cashback. Not given when a partner already earns commission on the sale; cancelled if the order is refunded.</p>
          <div className="flex flex-wrap items-end gap-4">
            <label className="flex items-center gap-2 font-medium"><input type="checkbox" name="referral_enabled" defaultChecked={referral.enabled} /> On</label>
            <label className="grid gap-1 font-medium">Credit for the referrer (%)<input name="referral_percent" defaultValue={referral.percent} inputMode="decimal" className="fc-input w-28" /></label>
            <button className="fc-btn fc-btn-primary !min-w-0 !px-5 !py-2.5 text-sm">Save</button>
          </div>
        </form>
      </Card>

      {(pending ?? []).length > 0 && (
        <Card title={`Reviews waiting for you (${pending!.length})`}>
          <p className="mb-3 text-sm text-muted">Open the customer to read the feedback, then approve (adds the {s.review_bonus_pct ?? 100}% top-up and emails them) or reject.</p>
          <ul className="divide-y divide-line text-sm">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {(pending as any[]).map((r) => (
              <li key={r.id} className="flex flex-wrap items-baseline justify-between gap-2 py-3">
                <span className="min-w-0">
                  <span className="font-medium">{r.profile?.full_name || r.profile?.email}</span> · {r.course?.title} · order #{r.order?.number} · {"★".repeat(r.rating)}
                  <span className="block truncate text-xs text-muted">{r.review}</span>
                </span>
                <Link href={`/admin/customers/${r.user_id}`} className="text-xs font-semibold underline">Review it</Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title="Cashback rules">
        <form action={saveCashbackSettings} className="grid gap-4 text-sm">
          <label className="flex items-center gap-2 text-base font-medium">
            <input type="checkbox" name="enabled" defaultChecked={s.enabled} /> Cashback is {s.enabled ? <span className="text-success">on</span> : <span className="text-muted">off</span>}
          </label>
          <fieldset className="grid gap-3 rounded-lg border border-line p-4">
            <legend className="px-1 font-medium">Default cashback</legend>
            <label className="flex flex-wrap items-center gap-2">
              <input type="radio" name="mode" value="percent" defaultChecked={s.mode !== "fixed"} /> Percentage of the purchase
              <input name="percent" defaultValue={s.percent} inputMode="decimal" aria-label="Cashback percent" className="fc-input w-24 !py-1.5" /> %
              <span className="text-xs text-muted">of the amount paid, before tax</span>
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2"><input type="radio" name="mode" value="fixed" defaultChecked={s.mode === "fixed"} /> Fixed amount per purchase</label>
              {currencies.map((c) => (
                <label key={c} className="flex items-center gap-1">{c}
                  <input name={`fixed_${c}`} defaultValue={major(s.fixed?.[c], c)} inputMode="decimal" placeholder="0" className="fc-input w-24 !py-1.5" />
                </label>
              ))}
            </div>
            <p className="text-xs text-muted">A fixed amount is given in the order&apos;s currency and never exceeds what was paid. Leave a currency empty for no cashback in it. Courses and programmes can have their own setting below.</p>
          </fieldset>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1">Credit valid for (days)
              <input name="validity_days" defaultValue={s.validity_days ?? ""} inputMode="numeric" placeholder="No expiry" className={field} />
              <span className="text-xs text-muted">From the day it is earned. Leave empty for no expiry. Ignored when a &quot;use credit by&quot; date is set.</span>
            </label>
            <label className="grid gap-1">Use credit by (optional)
              <input type="date" name="redeem_by" defaultValue={s.redeem_by ?? ""} className={field} />
              <span className="text-xs text-muted">A fixed last day (UAE time) for all new credit, e.g. the end of a launch offer. Replaces the days above.</span>
            </label>
            <label className="grid gap-1">Cashback with feedback and a review (%)
              <input name="review_bonus_pct" defaultValue={s.review_bonus_pct ?? ""} inputMode="numeric" placeholder="None" className={field} />
              <span className="text-xs text-muted">Total cashback for a buyer who sends feedback and a review, e.g. 100. Give it from the order in Admin → Customers.</span>
            </label>
            <label className="grid gap-1">Offer ends on (optional)
              <input type="date" name="ends_at" defaultValue={s.ends_at ?? ""} className={field} />
              <span className="text-xs text-muted">Orders paid after this day (UAE time) earn no cashback. Credit already earned stays valid.</span>
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
        <p className="mb-3 text-sm text-muted">Default: {describe(cashbackRule({ ...s, enabled: true }), currencies)}. Choose &ldquo;Default&rdquo;, &ldquo;None&rdquo;, a percentage or a fixed amount for each item.</p>
        <div className="grid gap-1 text-sm">
          {[...((courses ?? []) as Item[]).map((c) => ({ ...c, kind: "course" })), ...((bundles ?? []) as Item[]).map((b) => ({ ...b, kind: "bundle" }))].map((it) => (
            <form key={`${it.kind}:${it.id}`} action={saveItemCashback} className="flex flex-wrap items-center gap-3 border-t border-line py-2">
              <input type="hidden" name="kind" value={it.kind} />
              <input type="hidden" name="id" value={it.id} />
              <span className="min-w-0 flex-1">{it.kind === "bundle" ? "Programme: " : ""}{it.title}</span>
              <span className="text-xs text-muted">{!s.enabled ? "Cashback off" : describe(cashbackRule(s, { mode: it.cashback_mode, percent: it.cashback_percent, fixed: it.cashback_fixed }), currencies)}</span>
              <select name="mode" defaultValue={it.cashback_mode ?? ""} aria-label={`Cashback for ${it.title}`} className="fc-input w-36 !py-1.5">
                <option value="">Default</option><option value="none">None</option><option value="percent">Percentage</option><option value="fixed">Fixed amount</option>
              </select>
              <label className="flex items-center gap-1 text-xs">%<input name="percent" defaultValue={it.cashback_percent ?? ""} inputMode="decimal" className="fc-input w-16 !py-1.5" /></label>
              {currencies.map((c) => (
                <label key={c} className="flex items-center gap-1 text-xs">{c}
                  <input name={`fixed_${c}`} defaultValue={major(it.cashback_fixed?.[c], c)} inputMode="decimal" className="fc-input w-20 !py-1.5" />
                </label>
              ))}
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

      <Card title="Cashback Lifecycle">
        <p className="mb-3 text-sm text-muted">
          Every cashback credit (purchase cashback and review top-ups), by where it stands today. Only used cashback costs FinCoursa money;
          expired credit lapsed unused and costs nothing; refunds cancel unspent cashback.
        </p>
        {cbCur.size ? (
          <div className="grid gap-4">
            {[...cbCur.entries()].map(([c, t]) => (
              <div key={c} className="grid gap-2 sm:grid-cols-5">
                {([
                  ["Given", t.given, `${c} · all cashback issued`],
                  ["Used", t.used, "spent at checkout"],
                  ["Still Open", t.open, t.nextExpiry ? `next expiry ${formatDate(t.nextExpiry)}` : "no expiry date"],
                  ["Expired", t.expired, "lapsed unused"],
                  ["Cancelled", t.cancelled, "by refund"],
                ] as [string, number, string][]).map(([k, v, h]) => (
                  <div key={k} className="rounded-lg bg-surface p-4">
                    <p className="text-xs uppercase tracking-wide text-muted">{k}</p>
                    <p className="text-xl font-bold tabular-nums">{formatMoney(v, c)}</p>
                    <p className="text-xs text-muted">{h}{t.given > 0 && k !== "Given" ? ` · ${Math.round((v / t.given) * 100)}%` : ""}</p>
                  </div>
                ))}
              </div>
            ))}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="text-left text-muted"><tr>
                  <th className="py-2 font-medium">Month Issued</th><th className="py-2 font-medium">Currency</th>
                  <th className="py-2 text-right font-medium">Given</th><th className="py-2 text-right font-medium">Used</th>
                  <th className="py-2 text-right font-medium">Open</th><th className="py-2 text-right font-medium">Expired</th>
                  <th className="py-2 text-right font-medium">Cancelled</th>
                </tr></thead>
                <tbody>
                  {months.map(([k, t]) => {
                    const [mo, c] = k.split("|");
                    return (
                      <tr key={k} className="border-t border-line">
                        <td className="py-2">{monthLabel(mo)}</td><td className="py-2">{c}</td>
                        {[t.given, t.used, t.open, t.expired, t.cancelled].map((v, i) => <td key={i} className="py-2 text-right tabular-nums">{formatMoney(v, c)}</td>)}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div>
              <h3 className="mb-2 text-sm font-semibold">Expired Credits ({expiredList.length})</h3>
              {expiredList.length ? (
                <ul className="divide-y divide-line text-sm">
                  {expiredList.slice(0, 50).map((x) => (
                    <li key={x.id} className="flex justify-between gap-4 py-2">
                      <span>{x.who} · expired {formatDate(x.on)}</span>
                      <span className="tabular-nums">{formatMoney(x.amount, x.currency)} <span className="text-muted">of {formatMoney(x.given, x.currency)}</span></span>
                    </li>
                  ))}
                </ul>
              ) : <p className="text-sm text-muted">No cashback has expired yet.</p>}
            </div>
          </div>
        ) : <p className="text-sm text-muted">No cashback issued yet.</p>}
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
