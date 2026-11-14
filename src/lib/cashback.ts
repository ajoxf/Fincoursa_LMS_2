import "server-only";
import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSetting } from "@/lib/site-settings";

/** Admin → Cashback & credit. Stored in site_settings under "cashback". */
export type CashbackSettings = {
  enabled: boolean;
  /** default cashback, % of the amount paid before tax */
  percent: number;
  /** days the credit can be used for; null = never expires */
  validity_days: number | null;
  /** most of an order's price (after any code) that credit may pay, in % */
  max_redeem_pct: number;
  /** credit can be used on an order that also uses a discount code */
  allow_with_coupon: boolean;
  /** cashback is also earned on the part of an order paid with credit */
  earn_on_credit: boolean;
};

export const CASHBACK_DEFAULTS: CashbackSettings = {
  enabled: false, percent: 10, validity_days: 365, max_redeem_pct: 100, allow_with_coupon: true, earn_on_credit: false,
};

export const getCashbackSettings = cache(async (): Promise<CashbackSettings> =>
  ({ ...CASHBACK_DEFAULTS, ...((await getSetting<Partial<CashbackSettings>>("cashback")) ?? {}) }));

/** The cashback % for an item: its own override if set (0 = none), otherwise the default. */
export function cashbackPercent(s: CashbackSettings, override: number | string | null | undefined): number {
  if (!s.enabled) return 0;
  const v = override == null || override === "" ? s.percent : Number(override);
  return Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : 0;
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
