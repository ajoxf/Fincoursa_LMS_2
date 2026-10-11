// Central place for configuration. Server-only secrets are read lazily so the
// public site can build and render (in demo mode) before every service is configured.

export const env = {
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  defaultCurrency: (process.env.NEXT_PUBLIC_DEFAULT_CURRENCY ?? "USD").toUpperCase(),
};

/**
 * Partner coupon codes. When false, codes no longer credit sales to partners and are hidden
 * from the partner and admin screens; referral links become the only route. (Plan: switch off.)
 */
export const partnerCodesEnabled = (process.env.PARTNER_CODES_ENABLED ?? "true") !== "false";

export const isSupabaseConfigured = Boolean(env.supabaseUrl && env.supabaseAnonKey);

export function serverSecret(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing environment variable ${name}`);
  return v;
}
