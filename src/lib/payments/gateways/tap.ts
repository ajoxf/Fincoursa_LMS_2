import type { GatewayConfig, GatewayEvent, PaymentGateway } from "../types";
import { callJson } from "../http";
import { fromMajor, toMajorString } from "@/lib/money";

/* eslint-disable @typescript-eslint/no-explicit-any */
const API = "https://api.tap.company/v2";
const tap = (cfg: GatewayConfig, path: string, init: RequestInit = {}) =>
  callJson<any>("Tap", `${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${cfg.values.secret_key}`, "Content-Type": "application/json", accept: "application/json", ...init.headers },
  });

const FAILED = new Set(["ABANDONED", "CANCELLED", "FAILED", "DECLINED", "RESTRICTED", "VOID", "TIMEDOUT"]);

/** Turn a charge fetched from Tap's API into our event. */
function chargeEvent(c: any, prefix = ""): GatewayEvent[] {
  const orderId = c?.metadata?.order_id ?? c?.reference?.transaction;
  const eventId = `${prefix}${c.id}:${c.status}`;
  if (!orderId) return [{ type: "ignored", eventId, raw: c }];
  if (c.status === "CAPTURED") return [{ type: "payment.succeeded", eventId, orderId, sessionId: c.id, raw: c }];
  if (FAILED.has(c.status)) return [{ type: "payment.failed", eventId, orderId, raw: c }];
  return [{ type: "ignored", eventId, raw: c }];
}

/**
 * Tap Payments hosted checkout (src_all): cards, Apple Pay, KNET, mada, Benefit, Fawry and more across the GCC.
 * Webhooks are trusted only after re-fetching the charge or refund from Tap's API with our secret key.
 */
export const tapGateway: PaymentGateway = {
  id: "tap",
  name: "Tap Payments",
  label: "Card / KNET / mada / Benefit / Apple Pay",
  regions: "GCC: UAE, Saudi (mada), Kuwait (KNET), Bahrain (Benefit), Qatar, Oman, Egypt",
  keysHelp: "Tap Dashboard → goSell / Developers → API Credentials → Secret key. No separate webhook secret is needed: each payment carries its own callback URL.",
  webhookEvents: [],
  fields: [
    { key: "secret_key", label: "Secret key", secret: true, required: true, env: "TAP_SECRET_KEY", placeholder: "sk_live_… or sk_test_…" },
  ],
  currencies: ["AED", "SAR", "KWD", "BHD", "QAR", "OMR", "EGP", "USD", "EUR", "GBP"],

  async createCheckout(input, cfg) {
    const [first, ...rest] = (input.customer.name ?? "").trim().split(/\s+/);
    const charge = await tap(cfg, "/charges", {
      method: "POST",
      body: JSON.stringify({
        amount: Number(toMajorString(input.totalMinor, input.currency)),
        currency: input.currency,
        customer_initiated: true,
        threeDSecure: true,
        save_card: false,
        description: input.lines.map((l) => l.title).join(", ").slice(0, 250),
        metadata: { order_id: input.orderId },
        reference: { transaction: input.orderId, order: String(input.orderNumber) },
        receipt: { email: false, sms: false },
        customer: { first_name: first || "Customer", last_name: rest.join(" ") || undefined, email: input.customer.email },
        source: { id: "src_all" },
        post: { url: input.webhookUrl },
        redirect: { url: input.successUrl },
      }),
    });
    const url = charge?.transaction?.url;
    if (!url) throw new Error(`Tap did not return a payment page (status ${charge?.status ?? "unknown"})`);
    return { sessionId: charge.id, redirectUrl: url };
  },

  async parseWebhook(request, cfg) {
    const body = await request.json().catch(() => ({}));
    const id = String(body?.id ?? "");
    if (/^chg_/.test(id)) return chargeEvent(await tap(cfg, `/charges/${id}`));
    if (/^re_/.test(id)) {
      const r = await tap(cfg, `/refunds/${id}`);
      const orderId = r?.metadata?.order_id;
      if (r.status === "REFUNDED" && orderId) {
        return [{ type: "refund.succeeded", eventId: `${r.id}:${r.status}`, orderId, refundId: r.id, amountMinor: fromMajor(r.amount, r.currency), raw: r }];
      }
      return [{ type: "ignored", eventId: `${r.id}:${r.status}`, raw: r }];
    }
    throw new Error("unrecognised Tap callback");
  },

  async verify({ orderId, sessionId }, cfg) {
    const c = await tap(cfg, `/charges/${sessionId}`);
    if ((c?.metadata?.order_id ?? c?.reference?.transaction) !== orderId) return [];
    return chargeEvent(c, "verify:").filter((e) => e.type === "payment.succeeded");
  },

  async refund({ orderId, sessionId, amountMinor, currency }, cfg) {
    const r = await tap(cfg, "/refunds", {
      method: "POST",
      body: JSON.stringify({
        charge_id: sessionId, amount: Number(toMajorString(amountMinor, currency)), currency,
        reason: "requested_by_customer", metadata: { order_id: orderId }, reference: { merchant: orderId },
      }),
    });
    return { refundId: r.id };
  },

  async testConnection(cfg) {
    await tap(cfg, "/charges/list", { method: "POST", body: JSON.stringify({ limit: 1 }) });
    return `Connected to Tap in ${cfg.values.secret_key.startsWith("sk_test_") ? "test mode" : "LIVE mode"}.`;
  },
};
