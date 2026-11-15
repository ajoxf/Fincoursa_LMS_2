import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAll, getReportSettings } from "@/lib/marketing-metrics";
export { LINKEDIN, POST_STATUS, composerUrl, type PostMedia } from "@/lib/linkedin";

/** Next free variant for a campaign's posts: p1, p2, … */
export function nextVariant(existing: string[]) {
  let i = 1;
  while (existing.includes(`p${i}`)) i++;
  return `p${i}`;
}

/**
 * What each post brought in, through its tracked link (?v=<variant>):
 * clicks, sign-ups (people whose first visit came through it), customers and net revenue (US$) from orders placed after it.
 */
export async function postResults(campaignId: string) {
  const db = createAdminClient();
  const { fx } = await getReportSettings();
  const usd = (minor: number, cur: string) => {
    const c = (cur ?? "USD").toUpperCase();
    return Number(minor ?? 0) / (c === "JPY" || c === "KRW" ? 1 : 100) / (fx[c] ?? 1);
  };
  const [clicks, people, orders] = await Promise.all([
    fetchAll<{ variant: string | null }>((a, b) => db.from("campaign_clicks").select("variant").eq("campaign_id", campaignId).order("id").range(a, b)),
    fetchAll<{ acquisition: { v?: string } | null }>((a, b) => db.from("profiles").select("acquisition").eq("acquired_campaign_id", campaignId).order("id").range(a, b)),
    fetchAll<{ user_id: string; touch: { v?: string } | null; total_minor: number; tax_minor: number; refunded_minor: number; currency: string }>((a, b) =>
      db.from("orders").select("user_id, touch, total_minor, tax_minor, refunded_minor, currency").eq("campaign_id", campaignId)
        .in("status", ["paid", "partially_refunded", "refunded"]).order("id").range(a, b)),
  ]);
  const out = new Map<string, { clicks: number; signups: number; customers: number; revenue: number }>();
  const get = (v?: string | null) => {
    const k = (v ?? "").toLowerCase();
    let r = out.get(k);
    if (!r) { r = { clicks: 0, signups: 0, customers: 0, revenue: 0 }; out.set(k, r); }
    return r;
  };
  for (const c of clicks) get(c.variant).clicks++;
  for (const p of people) get(p.acquisition?.v).signups++;
  const buyers = new Map<string, Set<string>>();
  for (const o of orders) {
    const k = (o.touch?.v ?? "").toLowerCase();
    const t = Number(o.total_minor), r = Number(o.refunded_minor ?? 0);
    get(k).revenue += t > 0 ? usd((t - Number(o.tax_minor ?? 0)) * (1 - r / t), o.currency) : 0;
    const s = buyers.get(k) ?? new Set(); s.add(o.user_id); buyers.set(k, s);
  }
  for (const [k, s] of buyers) get(k).customers = s.size;
  return out;
}
