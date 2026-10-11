import "server-only";
import { cache } from "react";
import type { GatewayConfig, PaymentGateway } from "./types";
import { manualGateway } from "./gateways/manual";
import { stripeGateway } from "./gateways/stripe";
import { razorpayGateway } from "./gateways/razorpay";
import { tapGateway } from "./gateways/tap";
import { paypalGateway } from "./gateways/paypal";
import { makeCustomGateway } from "./gateways/custom";
import type { CustomGatewayRow } from "./types";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptSecrets } from "./secrets";

/** Register new adapters here. */
const gateways: PaymentGateway[] = [stripeGateway, razorpayGateway, tapGateway, paypalGateway, manualGateway];

/** All adapters in the code, connected or not. */
export function allGateways(): PaymentGateway[] {
  return gateways;
}

/** Built-in adapters only (synchronous). Use resolveGateway to include providers added by admins. */
export function getGateway(id: string): PaymentGateway | undefined {
  return gateways.find((g) => g.id === id);
}

/** Providers added on /admin/payments without code (empty if the table doesn't exist yet). */
export const customGateways = cache(async (): Promise<PaymentGateway[]> => {
  const { data, error } = await createAdminClient()
    .from("custom_gateways").select("id, name, label, instructions, pay_url, currencies").order("created_at");
  if (error) return [];
  return (data ?? []).map((r) => makeCustomGateway(r as CustomGatewayRow));
});

/** Built-in and admin-added providers. */
export async function everyGateway(): Promise<PaymentGateway[]> {
  return [...gateways, ...(await customGateways())];
}

export async function resolveGateway(id: string): Promise<PaymentGateway | undefined> {
  return getGateway(id) ?? (id.startsWith("custom-") ? (await customGateways()).find((g) => g.id === id) : undefined);
}

export type StoredSettings = {
  enabled: boolean;
  public_values: Record<string, string>;
  secret_hints: Record<string, string>;
  /** false when saved secrets can no longer be decrypted (encryption key changed) */
  readable: boolean;
  updated_at: string;
};

/** Raw rows from gateway_settings (empty if the table doesn't exist yet). */
const loadRows = cache(async () => {
  const { data, error } = await createAdminClient()
    .from("gateway_settings").select("gateway, enabled, public_values, secrets_enc, secret_hints, updated_at");
  if (error) return new Map<string, { enabled: boolean; public_values: Record<string, string>; secrets: Record<string, string> | null; secret_hints: Record<string, string>; updated_at: string }>();
  return new Map((data ?? []).map((r) => [r.gateway as string, {
    enabled: r.enabled as boolean,
    public_values: (r.public_values ?? {}) as Record<string, string>,
    secrets: decryptSecrets(r.secrets_enc as string | null),
    secret_hints: (r.secret_hints ?? {}) as Record<string, string>,
    updated_at: r.updated_at as string,
  }]));
});

/** What the admin screen may show: never the secret values themselves. */
export async function storedSettings(id: string): Promise<StoredSettings | null> {
  const r = (await loadRows()).get(id);
  return r ? { enabled: r.enabled, public_values: r.public_values, secret_hints: r.secret_hints, readable: r.secrets !== null, updated_at: r.updated_at } : null;
}

/** Keys for one provider: values saved on /admin/payments first, then Vercel env vars. */
export async function gatewayConfig(id: string): Promise<GatewayConfig> {
  const g = await resolveGateway(id);
  const row = (await loadRows()).get(id);
  const values: Record<string, string> = {};
  for (const f of g?.fields ?? []) {
    const v = (f.secret ? row?.secrets?.[f.key] : row?.public_values?.[f.key]) || (f.env ? process.env[f.env] : undefined);
    if (v) values[f.key] = v;
  }
  return { values, enabled: row ? row.enabled : true };
}

/** Which fields are filled from where, for the admin screen. */
export async function fieldSources(id: string): Promise<Record<string, "saved" | "env" | null>> {
  const g = await resolveGateway(id);
  const row = (await loadRows()).get(id);
  const out: Record<string, "saved" | "env" | null> = {};
  for (const f of g?.fields ?? []) {
    const saved = f.secret ? Boolean(row?.secrets?.[f.key]) : Boolean(row?.public_values?.[f.key]);
    out[f.key] = saved ? "saved" : f.env && process.env[f.env] ? "env" : null;
  }
  return out;
}

export function hasKeys(g: PaymentGateway, cfg: GatewayConfig): boolean {
  return g.isConfigured ? g.isConfigured(cfg) : g.fields.every((f) => !f.required || Boolean(cfg.values[f.key]));
}

/** Ready to take payments: keys present and not paused by an admin. */
export function isReady(g: PaymentGateway, cfg: GatewayConfig): boolean {
  return cfg.enabled && hasKeys(g, cfg);
}

/** A provider plus its keys, or null if it isn't ready. */
export async function connect(id: string): Promise<{ gateway: PaymentGateway; cfg: GatewayConfig } | null> {
  const gateway = await resolveGateway(id);
  if (!gateway) return null;
  const cfg = await gatewayConfig(id);
  return isReady(gateway, cfg) ? { gateway, cfg } : null;
}

/**
 * Gateways offered to a buyer, best first, from the `payment_routes` table:
 * most specific match (country + currency) wins, then priority. Providers without keys,
 * paused ones and ones that can't charge the currency are skipped.
 */
export async function gatewaysFor(country: string | null, currency: string): Promise<PaymentGateway[]> {
  const { data: routes } = await createAdminClient()
    .from("payment_routes")
    .select("country_code, currency, gateway, priority")
    .eq("is_active", true);

  const scored = (routes ?? [])
    .filter((r) => (!r.country_code || r.country_code === country) && (!r.currency || r.currency === currency))
    .map((r) => ({ ...r, score: (r.country_code ? 2 : 0) + (r.currency ? 1 : 0) }))
    .sort((a, b) => b.score - a.score || a.priority - b.priority);

  const seen = new Set<string>();
  const out: PaymentGateway[] = [];
  for (const r of scored) {
    const g = await resolveGateway(r.gateway);
    if (!g || seen.has(g.id)) continue;
    if (g.currencies && !g.currencies.includes(currency)) continue;
    if (!isReady(g, await gatewayConfig(g.id))) continue;
    seen.add(g.id);
    out.push(g);
  }
  return out;
}
