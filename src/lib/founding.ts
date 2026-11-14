import "server-only";
import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSetting } from "@/lib/site-settings";
import { formatMoney } from "@/lib/money";

/** Admin → Founding members. Stored in site_settings under "founding". */
export type FoundingSettings = {
  enabled: boolean;
  /** buying one of these courses (while joining is open) makes the buyer a founding member */
  qualifying_course_ids: string[];
  /** last moment to join (ISO); null = open until switched off */
  join_ends_at: string | null;
  /** most members; null = no cap */
  cap: number | null;
  /** members' benefit on future purchases: a % off, or a fixed amount off per currency (minor units) */
  mode: "percent" | "fixed";
  percent: number;
  fixed: Record<string, number>;
  /** benefit stops after this date (ISO); null = lifetime */
  benefit_ends_at: string | null;
  /** can be used together with a discount code (otherwise the larger of the two applies) */
  allow_with_coupon: boolean;
};

export const FOUNDING_DEFAULTS: FoundingSettings = {
  enabled: false, qualifying_course_ids: [], join_ends_at: null, cap: null,
  mode: "percent", percent: 20, fixed: {}, benefit_ends_at: null, allow_with_coupon: false,
};

export const getFoundingSettings = cache(async (): Promise<FoundingSettings> =>
  ({ ...FOUNDING_DEFAULTS, ...((await getSetting<Partial<FoundingSettings>>("founding")) ?? {}) }));

export type Membership = { member_number: number; joined_at: string } | null;

/** The user's founding membership, if active. */
export const getMembership = cache(async (userId: string | null | undefined): Promise<Membership> => {
  if (!userId) return null;
  try {
    const { data } = await createAdminClient().from("founding_members")
      .select("member_number, joined_at, revoked_at").eq("user_id", userId).maybeSingle();
    return data && !data.revoked_at ? { member_number: data.member_number, joined_at: data.joined_at } : null;
  } catch {
    return null; // demo mode
  }
});

/** Is the members' benefit live right now? */
export function benefitLive(s: FoundingSettings, now = new Date()): boolean {
  return s.enabled && (!s.benefit_ends_at || new Date(s.benefit_ends_at) > now);
}

/** Can people still become members? */
export function joiningOpen(s: FoundingSettings, now = new Date()): boolean {
  return s.enabled && s.qualifying_course_ids.length > 0 && (!s.join_ends_at || new Date(s.join_ends_at) > now);
}

/** Members' discount on a price (minor units) in this currency. */
export function foundingDiscount(s: FoundingSettings, currency: string, amountMinor: number): number {
  if (amountMinor <= 0) return 0;
  if (s.mode === "percent") return Math.min(amountMinor, Math.round(amountMinor * Math.max(0, Math.min(100, s.percent)) / 100));
  return Math.min(amountMinor, Math.max(0, Math.round(Number(s.fixed?.[currency.toUpperCase()] ?? 0))));
}

/** "20%" or "$15.00"; null when nothing applies in this currency. */
export function foundingLabel(s: FoundingSettings, currency: string): string | null {
  if (s.mode === "percent") return s.percent > 0 ? `${+s.percent.toFixed(2)}%` : null;
  const v = Number(s.fixed?.[currency.toUpperCase()] ?? 0);
  return v > 0 ? formatMoney(v, currency) : null;
}
