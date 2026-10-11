import type { GatewayConfig, GatewayEvent, PaymentGateway } from "../types";
import { callJson } from "../http";
import { toMajorString } from "@/lib/money";

/* eslint-disable @typescript-eslint/no-explicit-any */
const base = (cfg: GatewayConfig) => (cfg.values.environment === "sandbox" ? "https://api-sandbox.nowpayments.io/v1" : "https://api.nowpayments.io/v1");
const np = (cfg: GatewayConfig, path: string, init: RequestInit = {}) =>
  callJson<any>("NOWPayments", `${base(cfg)}${path}`, {
    ...init,
    headers: { "x-api-key": cfg.values.api_key, "Content-Type": "application/json", ...init.headers },
  });

const FAILED = new Set(["failed", "expired"]);

/**
 * NOWPayments hosted crypto invoice: the buyer pays in BTC, ETH, USDT, USDC and 300+ coins, priced in
 * our currency. Callbacks (IPN) are trusted only after re-fetching the payment from NOWPayments' API.
 * Crypto refunds are sent by hand from the NOWPayments dashboard, then recorded on the Orders page.
 */
export const nowpaymentsGateway: PaymentGateway = {
  id: "nowpayments",
  name: "NOWPayments (crypto)",
  label: "Crypto (USDT, USDC, BTC, ETH and more)",
  regions: "Global crypto payments: 300+ coins, settled to your crypto wallet (or converted, depending on your NOWPayments setup)",
  keysHelp: "nowpayments.io → Dashboard → Store Settings → API keys → Generate. Also set your payout wallet there. For testing, create a sandbox account at account-sandbox.nowpayments.io.",
  webhookEvents: [],
  fields: [
    { key: "environment", label: "Environment", secret: false, required: true, options: ["live", "sandbox"], env: "NOWPAYMENTS_ENVIRONMENT" },
    { key: "api_key", label: "API key", secret: true, required: true, env: "NOWPAYMENTS_API_KEY" },
  ],
  currencies: null,

  async createCheckout(input, cfg) {
    const inv = await np(cfg, "/invoice", {
      method: "POST",
      body: JSON.stringify({
        price_amount: Number(toMajorString(input.totalMinor, input.currency)),
        price_currency: input.currency.toLowerCase(),
        order_id: input.orderId,
        order_description: `FinCoursa order FC-${input.orderNumber}: ${input.lines.map((l) => l.title).join(", ")}`.slice(0, 250),
        ipn_callback_url: input.webhookUrl,
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
        is_fee_paid_by_user: false,
      }),
    });
    if (!inv?.invoice_url) throw new Error("NOWPayments did not return a payment page");
    return { sessionId: `np_invoice_${inv.id}`, redirectUrl: inv.invoice_url };
  },

  async parseWebhook(request, cfg) {
    const body = await request.json().catch(() => ({}));
    const paymentId = String(body?.payment_id ?? "");
    if (!/^\d+$/.test(paymentId)) throw new Error("no payment_id");
    // never trust the callback body: ask NOWPayments for the real status
    const p = await np(cfg, `/payment/${paymentId}`);
    const orderId = p?.order_id as string | undefined;
    const eventId = `${paymentId}:${p.payment_status}`;
    if (!orderId) return [{ type: "ignored", eventId, raw: p }];
    if (p.payment_status === "finished") {
      return [{ type: "payment.succeeded", eventId, orderId, sessionId: `np_payment_${paymentId}`, raw: p }] satisfies GatewayEvent[];
    }
    if (FAILED.has(p.payment_status)) return [{ type: "payment.failed", eventId, orderId, raw: p }];
    return [{ type: "ignored", eventId, raw: p }]; // waiting, confirming, partially_paid…
  },

  async testConnection(cfg) {
    const r = await np(cfg, "/merchant/coins");
    const n = Array.isArray(r?.selectedCurrencies) ? r.selectedCurrencies.length : null;
    return `Connected to NOWPayments ${cfg.values.environment === "sandbox" ? "sandbox" : "LIVE"}${n ? ` (${n} coins enabled)` : ""}.`;
  },
};
