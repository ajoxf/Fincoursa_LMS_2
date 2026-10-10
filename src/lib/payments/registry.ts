import "server-only";
import type { PaymentGateway } from "./types";
import { manualGateway } from "./gateways/manual";
import { stripeGateway } from "./gateways/stripe";
import { createAdminClient } from "@/lib/supabase/admin";

/** Register new adapters here. */
const gateways: PaymentGateway[] = [stripeGateway, manualGateway];

export function getGateway(id: string): PaymentGateway | undefined {
  return gateways.find((g) => g.id === id);
}

/**
 * Gateways offered to a buyer, best first, from the `payment_routes` table:
 * most specific match (country + currency) wins, then priority. Unconfigured
 * adapters and ones that can't charge the currency are skipped.
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
    const g = getGateway(r.gateway);
    if (!g || seen.has(g.id) || !g.isConfigured()) continue;
    if (g.currencies && !g.currencies.includes(currency)) continue;
    seen.add(g.id);
    out.push(g);
  }
  return out;
}
