import "server-only";
import { randomBytes } from "node:crypto";
import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSetting } from "@/lib/site-settings";
import { env } from "@/lib/env";

/**
 * Refer a friend: everyone gets a personal link (fincoursa.com/r/CODE). A friend who opens it and buys within
 * 30 days earns the person who shared it a % of what the friend paid (before tax) as FinCoursa credit.
 * Settings in site_settings "referral". The credit is granted when the order is paid (database trigger).
 */
export type ReferralSettings = { enabled: boolean; percent: number };
export const REFERRAL_DEFAULTS: ReferralSettings = { enabled: true, percent: 10 };
export const REFERRAL_COOKIE = "fc_friend";
export const REFERRAL_DAYS = 30;

export const getReferralSettings = cache(async (): Promise<ReferralSettings> =>
  ({ ...REFERRAL_DEFAULTS, ...((await getSetting<Partial<ReferralSettings>>("referral")) ?? {}) }));

export const referralUrl = (code: string) => `${env.siteUrl}/r/${code}`;

/** The person's referral code, created the first time it's needed (e.g. PRIYA-7K2Q). */
export async function ensureReferralCode(userId: string, fullName: string | null, email: string | null): Promise<string> {
  const db = createAdminClient();
  const { data: p } = await db.from("profiles").select("referral_code").eq("id", userId).maybeSingle();
  if (p?.referral_code) return p.referral_code;
  const stem = ((fullName ?? "").split(/\s+/)[0] || (email ?? "").split("@")[0] || "FRIEND")
    .normalize("NFKD").replace(/[^A-Za-z]/g, "").toUpperCase().slice(0, 10) || "FRIEND";
  for (let i = 0; i < 6; i++) {
    const code = `${stem}-${randomBytes(3).toString("hex").toUpperCase().slice(0, 4)}`;
    const { error } = await db.from("profiles").update({ referral_code: code }).eq("id", userId).is("referral_code", null);
    if (!error) {
      const { data: again } = await db.from("profiles").select("referral_code").eq("id", userId).maybeSingle();
      if (again?.referral_code) return again.referral_code;
    }
  }
  throw new Error("Could not create a referral code");
}

/** Who owns a referral code (null if unknown). */
export async function referrerFor(code: string | null | undefined): Promise<string | null> {
  if (!code || !/^[A-Za-z]{1,10}-[A-Za-z0-9]{4}$/.test(code)) return null;
  const { data } = await createAdminClient().from("profiles").select("id").ilike("referral_code", code).maybeSingle();
  return data?.id ?? null;
}

/** Friends who bought through someone's link, and the credit it earned them. */
export async function referralStats(userId: string) {
  const { data } = await createAdminClient().from("credit_grants").select("amount_minor, currency, created_at, revoked_at").eq("user_id", userId).eq("source", "referral");
  const live = (data ?? []).filter((g) => !g.revoked_at);
  const earned: Record<string, number> = {};
  for (const g of live) earned[g.currency] = (earned[g.currency] ?? 0) + Number(g.amount_minor);
  return { friends: live.length, earned };
}
