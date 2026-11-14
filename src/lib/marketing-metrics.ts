import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSetting } from "@/lib/site-settings";

/**
 * Marketing numbers for Admin → Marketing. All money is converted to US dollars with the rates in
 * Settings (approximate; good enough for decisions, not for accounting).
 *
 * Definitions (shown on the page too):
 * - New customer: someone whose first paid order falls in the period.
 * - Credited campaign: for a customer, the campaign that first brought them (else the campaign of their first order).
 *   For revenue, the campaign of each order (the latest campaign touch before buying).
 * - Net revenue: paid orders less tax and refunds.
 * - CAC: marketing spend ÷ new customers. Blended CAC uses all spend and all new customers.
 * - LTV: net revenue per customer to date (realised, not a forecast).
 */

/** Fetch every row (the API returns at most 1,000 per request). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: any[] | null }>, max = 200000): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < max; from += 1000) {
    const { data } = await build(from, from + 999);
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

export type ReportSettings = { fx: Record<string, number> }; // units of currency per 1 USD
export const REPORT_DEFAULTS: ReportSettings = { fx: { USD: 1, INR: 84, AED: 3.67, SGD: 1.34, GBP: 0.79, EUR: 0.93 } };
export async function getReportSettings(): Promise<ReportSettings> {
  const s = await getSetting<Partial<ReportSettings>>("marketing_report");
  return { fx: { ...REPORT_DEFAULTS.fx, ...(s?.fx ?? {}) } };
}

export const CHANNELS: [string, string][] = [
  ["linkedin_ads", "LinkedIn ads"], ["linkedin_organic", "LinkedIn posts"], ["email", "Email"], ["partner", "Partners & affiliates"],
  ["webinar", "Webinars"], ["event", "Events"], ["referral", "Referrals"], ["search", "Search"], ["other", "Other"],
];
export const channelLabel = (c: string | null) => (c ? CHANNELS.find(([v]) => v === c)?.[1] ?? c : "Direct / unknown");

type Campaign = { id: string; name: string; code: string; channel: string; stage: string; objective: string; target_metric: string | null; target_value: number | null; budget_minor: number | null; currency: string; starts_on: string | null; ends_on: string | null };
export type Row = {
  key: string; label: string; channel?: string; campaign?: Campaign;
  spend: number; clicks: number; signups: number; customers: number; revenue: number; leads: number; pipeline: number; won: number;
  cac: number | null; roas: number | null; ltv: number | null; cpl: number | null;
};

export async function marketingReport(fromIso: string, toIso: string) {
  const db = createAdminClient();
  const { fx } = await getReportSettings();
  // minor units in any currency → whole US dollars
  const usd = (minor: number | string | null | undefined, cur: string | null | undefined) => {
    const c = (cur ?? "USD").toUpperCase();
    const factor = c === "JPY" || c === "KRW" ? 1 : 100;
    return Number(minor ?? 0) / factor / (fx[c] ?? 1);
  };
  const inRange = (iso: string | null | undefined) => !!iso && iso >= fromIso && iso < toIso;

  type O = { user_id: string; status: string; paid_at: string | null; total_minor: number; tax_minor: number; refunded_minor: number; currency: string; campaign_id: string | null };
  const [campaigns, costs, clicks, profiles, orders, leads] = await Promise.all([
    fetchAll<Campaign>((a, b) => db.from("campaigns").select("id, name, code, channel, stage, objective, target_metric, target_value, budget_minor, currency, starts_on, ends_on").range(a, b)),
    fetchAll<{ campaign_id: string; spent_on: string; amount_minor: number; currency: string }>((a, b) => db.from("campaign_costs").select("campaign_id, spent_on, amount_minor, currency").range(a, b)),
    fetchAll<{ campaign_id: string; created_at: string }>((a, b) => db.from("campaign_clicks").select("campaign_id, created_at").gte("created_at", fromIso).lt("created_at", toIso).order("id").range(a, b)),
    fetchAll<{ id: string; created_at: string; acquired_campaign_id: string | null }>((a, b) => db.from("profiles").select("id, created_at, acquired_campaign_id").order("id").range(a, b)),
    fetchAll<O>((a, b) => db.from("orders").select("user_id, status, paid_at, total_minor, tax_minor, refunded_minor, currency, campaign_id")
      .in("status", ["paid", "partially_refunded", "refunded"]).not("paid_at", "is", null).order("paid_at").order("id").range(a, b)),
    fetchAll<{ campaign_id: string | null; stage: string; value_minor: number | null; currency: string | null; created_at: string }>((a, b) => db.from("institution_leads").select("campaign_id, stage, value_minor, currency, created_at").order("id").range(a, b)),
  ]);
  const byId = new Map((campaigns ?? []).map((c) => [c.id, c as Campaign]));
  const net = (o: { total_minor: number; tax_minor: number; refunded_minor: number; currency: string }) => {
    const t = Number(o.total_minor), r = Number(o.refunded_minor ?? 0);
    return t > 0 ? usd((t - Number(o.tax_minor ?? 0)) * (1 - r / t), o.currency) : 0;
  };

  // customers: first paid order, credited campaign, lifetime net revenue
  const acquired = new Map((profiles ?? []).map((p) => [p.id, p.acquired_campaign_id as string | null]));
  type Cust = { first: string; campaign: string | null; total: number; months: Map<number, number> };
  const customers = new Map<string, Cust>();
  for (const o of orders ?? []) {
    let c = customers.get(o.user_id);
    if (!c) { c = { first: o.paid_at!, campaign: acquired.get(o.user_id) ?? o.campaign_id ?? null, total: 0, months: new Map() }; customers.set(o.user_id, c); }
    const v = net(o);
    c.total += v;
    const m = monthsBetween(c.first, o.paid_at!);
    c.months.set(m, (c.months.get(m) ?? 0) + v);
  }

  // one row per campaign, per channel, plus "direct / unknown"
  const rows = new Map<string, Row>();
  const row = (key: string, label: string, extra: Partial<Row> = {}) => {
    let r = rows.get(key);
    if (!r) { r = { key, label, spend: 0, clicks: 0, signups: 0, customers: 0, revenue: 0, leads: 0, pipeline: 0, won: 0, cac: null, roas: null, ltv: null, cpl: null, ...extra }; rows.set(key, r); }
    return r;
  };
  const keyFor = (campaignId: string | null) => (campaignId && byId.has(campaignId) ? campaignId : "direct");
  for (const c of campaigns ?? []) row(c.id, c.name, { channel: c.channel, campaign: c as Campaign });
  row("direct", "Direct / unknown", { channel: undefined });

  for (const k of costs ?? []) if (inRange(`${k.spent_on}T00:00:00Z`)) row(keyFor(k.campaign_id), "").spend += usd(k.amount_minor, k.currency);
  for (const k of clicks ?? []) row(keyFor(k.campaign_id), "").clicks++;
  for (const p of profiles ?? []) if (inRange(p.created_at)) row(keyFor(p.acquired_campaign_id), "").signups++;
  const ltvSum = new Map<string, { n: number; total: number }>();
  for (const c of customers.values()) {
    const k = keyFor(c.campaign);
    if (inRange(c.first)) row(k, "").customers++;
    const s = ltvSum.get(k) ?? { n: 0, total: 0 }; s.n++; s.total += c.total; ltvSum.set(k, s);
  }
  for (const o of orders ?? []) if (inRange(o.paid_at)) row(keyFor(o.campaign_id), "").revenue += net(o);
  for (const l of leads ?? []) {
    const r = row(keyFor(l.campaign_id), "");
    if (inRange(l.created_at)) { r.leads++; if (!["won", "lost"].includes(l.stage)) r.pipeline += usd(l.value_minor, l.currency); }
    if (l.stage === "won" && inRange(l.created_at)) r.won += usd(l.value_minor, l.currency);
  }
  const finish = (r: Row, ltv?: { n: number; total: number }) => {
    r.cac = r.spend > 0 && r.customers > 0 ? r.spend / r.customers : null;
    r.roas = r.spend > 0 ? (r.revenue + r.won) / r.spend : null;
    r.cpl = r.spend > 0 && r.leads > 0 ? r.spend / r.leads : null;
    r.ltv = ltv && ltv.n ? ltv.total / ltv.n : null;
    return r;
  };
  const campaignRows = [...rows.values()].map((r) => finish(r, ltvSum.get(r.key)));

  // per channel
  const channels = new Map<string, Row>();
  const chLtv = new Map<string, { n: number; total: number }>();
  for (const r of campaignRows) {
    const ch = r.campaign?.channel ?? "direct";
    const c = channels.get(ch) ?? { key: ch, label: ch === "direct" ? "Direct / unknown" : channelLabel(ch), spend: 0, clicks: 0, signups: 0, customers: 0, revenue: 0, leads: 0, pipeline: 0, won: 0, cac: null, roas: null, ltv: null, cpl: null };
    for (const f of ["spend", "clicks", "signups", "customers", "revenue", "leads", "pipeline", "won"] as const) c[f] += r[f];
    channels.set(ch, c);
    const l = ltvSum.get(r.key); if (l) { const s = chLtv.get(ch) ?? { n: 0, total: 0 }; s.n += l.n; s.total += l.total; chLtv.set(ch, s); }
  }
  const channelRows = [...channels.values()].map((c) => finish(c, chLtv.get(c.key)));

  // totals
  const total = finish(campaignRows.reduce((t, r) => {
    for (const f of ["spend", "clicks", "signups", "customers", "revenue", "leads", "pipeline", "won"] as const) t[f] += r[f];
    return t;
  }, { key: "all", label: "All", spend: 0, clicks: 0, signups: 0, customers: 0, revenue: 0, leads: 0, pipeline: 0, won: 0, cac: null, roas: null, ltv: null, cpl: null } as Row),
  { n: customers.size, total: [...customers.values()].reduce((a, c) => a + c.total, 0) });
  const paidSpend = channelRows.filter((c) => c.key !== "direct").reduce((a, c) => a + c.spend, 0);

  // cohorts: month of first purchase → customers and average cumulative net revenue per customer
  const cohorts = new Map<string, { n: number; at: Map<number, number> }>();
  const nowIso = toIso < new Date().toISOString() ? toIso : new Date().toISOString();
  for (const c of customers.values()) {
    const k = c.first.slice(0, 7);
    const co = cohorts.get(k) ?? { n: 0, at: new Map() }; co.n++;
    let cum = 0;
    for (let m = 0; m <= 12; m++) { cum += c.months.get(m) ?? 0; co.at.set(m, (co.at.get(m) ?? 0) + cum); }
    cohorts.set(k, co);
  }
  const cohortRows = [...cohorts.entries()].sort((a, b) => b[0].localeCompare(a[0])).slice(0, 12).map(([month, co]) => {
    const age = monthsBetween(`${month}-01T00:00:00Z`, nowIso);
    return { month, customers: co.n, values: [0, 1, 3, 6, 12].map((m) => (m <= age ? (co.at.get(m) ?? 0) / co.n : null)) };
  });

  return { total, paidSpend, campaignRows, channelRows, cohortRows, customersAllTime: customers.size };
}

function monthsBetween(aIso: string, bIso: string) {
  const a = new Date(aIso), b = new Date(bIso);
  return Math.max(0, (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth()));
}

/** Campaign lifetime numbers (whole campaign, not a period), for the campaign page and process checks. */
export async function campaignLifetime(id: string) {
  const r = await marketingReport("1970-01-01T00:00:00Z", "2999-01-01T00:00:00Z");
  return r.campaignRows.find((x) => x.key === id) ?? null;
}

export const fmtUsd = (v: number | null | undefined, digits = 0) =>
  v == null ? "–" : `US$${v.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
