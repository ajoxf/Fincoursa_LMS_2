import "server-only";
import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSetting } from "@/lib/site-settings";
import { formatMoney } from "@/lib/money";

/** Admin → Cashback & credit. Stored in site_settings under "cashback". */
export type CashbackMode = "percent" | "fixed";

export type CashbackSettings = {
  enabled: boolean;
  /** default cashback: a % of the amount paid (before tax), or a fixed amount per currency */
  mode: CashbackMode;
  percent: number;
  /** fixed cashback in minor units per currency, e.g. { USD: 1000 } = $10 */
  fixed: Record<string, number>;
  /** days the credit can be used for; null = never expires */
  validity_days: number | null;
  /** most of an order's price (after any code) that credit may pay, in % */
  max_redeem_pct: number;
  /** credit can be used on an order that also uses a discount code */
  allow_with_coupon: boolean;
  /** cashback is also earned on the part of an order paid with credit */
  earn_on_credit: boolean;
  /** total cashback (% of the amount paid, before tax) for a buyer who gives feedback and a review; the admin tops it up
   *  from the order in Admin → Customers. null = no review bonus */
  review_bonus_pct?: number | null;
  /** last day to earn cashback (end of that day, UAE time), e.g. a launch offer; null = no end date */
  ends_at?: string | null;
  /** last day credit can be used (end of that day, UAE time); when set it replaces validity_days. null = use validity_days */
  redeem_by?: string | null;
};

export const CASHBACK_DEFAULTS: CashbackSettings = {
  enabled: false, mode: "percent", percent: 10, fixed: {}, validity_days: 365, max_redeem_pct: 100, allow_with_coupon: true, earn_on_credit: false, ends_at: null, review_bonus_pct: null, redeem_by: null,
};

/** Cashback is on and its end date (if any) hasn't passed. */
export function cashbackLive(s: CashbackSettings) {
  return s.enabled && (!s.ends_at || Date.now() <= new Date(`${s.ends_at}T23:59:59+04:00`).getTime());
}

const endOfDayUae = (d: string) => new Date(`${d}T23:59:59+04:00`);

/** When new credit expires: the fixed "use by" date if set, else validity_days from now; null = never. */
export function creditExpiry(s: CashbackSettings, from = Date.now()): Date | null {
  if (s.redeem_by) return endOfDayUae(s.redeem_by);
  return s.validity_days ? new Date(from + s.validity_days * 864e5) : null;
}

/** Days the credit on a new order stays usable (stored on the order and applied when it is paid). */
export function creditValidDays(s: CashbackSettings): number | null {
  if (s.redeem_by) return Math.max(1, Math.ceil((endOfDayUae(s.redeem_by).getTime() - Date.now()) / 864e5));
  return s.validity_days ?? null;
}

export const getCashbackSettings = cache(async (): Promise<CashbackSettings> =>
  ({ ...CASHBACK_DEFAULTS, ...((await getSetting<Partial<CashbackSettings>>("cashback")) ?? {}) }));

/** A course's or programme's own setting; mode null = use the default. */
export type ItemCashback = {
  mode?: "none" | CashbackMode | null;
  percent?: number | string | null;
  fixed?: Record<string, number> | null;
};

export type CashbackRule = { mode: "percent"; percent: number } | { mode: "fixed"; fixed: Record<string, number> };

/** The rule that applies to an item, or null when there is no cashback. */
export function cashbackRule(s: CashbackSettings, item?: ItemCashback | null): CashbackRule | null {
  if (!cashbackLive(s)) return null;
  const mode = item?.mode ?? s.mode;
  if (mode === "none") return null;
  if (mode === "fixed") {
    const fixed = item?.mode === "fixed" ? item.fixed ?? {} : s.fixed ?? {};
    return Object.values(fixed).some((v) => Number(v) > 0) ? { mode: "fixed", fixed } : null;
  }
  const pct = Math.max(0, Math.min(100, Number(item?.mode === "percent" ? item.percent : s.percent) || 0));
  return pct > 0 ? { mode: "percent", percent: pct } : null;
}

/** Cashback earned on an order in this currency; never more than the amount it is earned on. */
export function cashbackAmount(rule: CashbackRule | null, currency: string, earnBaseMinor: number): number {
  if (!rule || earnBaseMinor <= 0) return 0;
  if (rule.mode === "percent") return Math.round(earnBaseMinor * rule.percent / 100);
  return Math.min(earnBaseMinor, Math.max(0, Math.round(Number(rule.fixed[currency.toUpperCase()] ?? 0))));
}

/** "10%" or "$10.00"; null when the rule gives nothing in this currency. */
export function cashbackLabel(rule: CashbackRule | null, currency: string): string | null {
  if (!rule) return null;
  if (rule.mode === "percent") return `${+rule.percent.toFixed(2)}%`;
  const v = Number(rule.fixed[currency.toUpperCase()] ?? 0);
  return v > 0 ? formatMoney(v, currency) : null;
}

export type CreditGrant = {
  id: string; currency: string; amount_minor: number; remaining_minor: number; source: string;
  note: string | null; expires_at: string | null; revoked_at: string | null; created_at: string;
};

const spendable = (g: CreditGrant, now = Date.now()) =>
  !g.revoked_at && g.remaining_minor > 0 && (!g.expires_at || new Date(g.expires_at).getTime() > now);

/** Spendable credit by currency, plus the grants behind it (newest first). */
export async function creditFor(userId: string): Promise<{ balances: Record<string, number>; grants: CreditGrant[]; nextExpiry: Record<string, string | null> }> {
  try {
    const { data } = await createAdminClient().from("credit_grants")
      .select("id, currency, amount_minor, remaining_minor, source, note, expires_at, revoked_at, created_at")
      .eq("user_id", userId).order("created_at", { ascending: false });
    const grants = (data ?? []) as CreditGrant[];
    const balances: Record<string, number> = {};
    const nextExpiry: Record<string, string | null> = {};
    for (const g of grants.filter((x) => spendable(x))) {
      balances[g.currency] = (balances[g.currency] ?? 0) + Number(g.remaining_minor);
      if (g.expires_at && (!nextExpiry[g.currency] || g.expires_at < nextExpiry[g.currency]!)) nextExpiry[g.currency] = g.expires_at;
    }
    return { balances, grants, nextExpiry };
  } catch {
    return { balances: {}, grants: [], nextExpiry: {} }; // demo mode
  }
}

export async function creditBalance(userId: string, currency: string): Promise<number> {
  return (await creditFor(userId)).balances[currency.toUpperCase()] ?? 0;
}
