import type { GatewayConfig, GatewayEvent, PaymentGateway } from "../types";
import { basicAuth, callJson } from "../http";
import { fromMajor, toMajorString } from "@/lib/money";

/* eslint-disable @typescript-eslint/no-explicit-any */
const base = (cfg: GatewayConfig) => (cfg.values.environment === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com");

const tokens = new Map<string, { token: string; expires: number }>();
async function token(cfg: GatewayConfig) {
  const k = `${cfg.values.environment}:${cfg.values.client_id}`;
  const t = tokens.get(k);
  if (t && t.expires > Date.now() + 60_000) return t.token;
  const r = await callJson<any>("PayPal", `${base(cfg)}/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: basicAuth(cfg.values.client_id, cfg.values.client_secret), "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  tokens.set(k, { token: r.access_token, expires: Date.now() + Number(r.expires_in ?? 3000) * 1000 });
  return r.access_token as string;
}

const pp = async (cfg: GatewayConfig, path: string, init: RequestInit = {}) =>
  callJson<any>("PayPal", `${base(cfg)}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${await token(cfg)}`, "Content-Type": "application/json", ...init.headers },
  });

/** Capture an approved PayPal order (safe to repeat) and report the result. */
async function captureOrder(cfg: GatewayConfig, paypalOrderId: string, prefix: string): Promise<GatewayEvent[]> {
  let order = await pp(cfg, `/v2/checkout/orders/${paypalOrderId}`);
  if (order.status === "APPROVED") {
    order = await pp(cfg, `/v2/checkout/orders/${paypalOrderId}/capture`, {
      method: "POST", headers: { "PayPal-Request-Id": `capture-${paypalOrderId}` },
    });
  }
  const unit = order.purchase_units?.[0];
  const orderId = unit?.custom_id ?? unit?.reference_id;
  const capture = unit?.payments?.captures?.[0];
  const eventId = `${prefix}${paypalOrderId}:${order.status}`;
  if (!orderId) return [{ type: "ignored", eventId, raw: order }];
  if (order.status === "COMPLETED" && capture?.status === "COMPLETED") {
    return [{ type: "payment.succeeded", eventId, orderId, sessionId: paypalOrderId, raw: order }];
  }
  if (capture?.status === "DECLINED" || order.status === "VOIDED") return [{ type: "payment.failed", eventId, orderId, raw: order }];
  return [{ type: "ignored", eventId, raw: order }];
}

/**
 * PayPal Checkout (Orders v2). The buyer approves on PayPal, then we capture the payment —
 * from the webhook, or when the buyer lands back on our success page, whichever comes first.
 * Webhooks are trusted only after re-fetching the order from PayPal's API.
 */
export const paypalGateway: PaymentGateway = {
  id: "paypal",
  name: "PayPal",
  label: "PayPal",
  regions: "Global PayPal wallet and cards (USD, EUR, GBP and other PayPal currencies; not AED or INR)",
  keysHelp: "developer.paypal.com → Apps & Credentials → your app (switch Sandbox/Live) → Client ID and Secret. Add a webhook to the app with the events below.",
  webhookEvents: ["CHECKOUT.ORDER.APPROVED", "PAYMENT.CAPTURE.COMPLETED", "PAYMENT.CAPTURE.DENIED", "PAYMENT.CAPTURE.REFUNDED"],
  fields: [
    { key: "environment", label: "Environment", secret: false, required: true, env: "PAYPAL_ENVIRONMENT", options: ["sandbox", "live"] },
    { key: "client_id", label: "Client ID", secret: false, required: true, env: "PAYPAL_CLIENT_ID" },
    { key: "client_secret", label: "Secret", secret: true, required: true, env: "PAYPAL_CLIENT_SECRET" },
  ],
  currencies: ["USD", "EUR", "GBP", "AUD", "CAD", "SGD", "HKD", "CHF", "SEK", "NOK", "DKK", "NZD", "PLN", "JPY"],

  async createCheckout(input, cfg) {
    const order = await pp(cfg, "/v2/checkout/orders", {
      method: "POST",
      headers: { "PayPal-Request-Id": `order-${input.orderId}` },
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [{
          reference_id: input.orderId,
          custom_id: input.orderId,
          description: input.lines.map((l) => l.title).join(", ").slice(0, 127),
          amount: { currency_code: input.currency, value: toMajorString(input.totalMinor, input.currency) },
        }],
        payment_source: { paypal: { experience_context: {
          brand_name: "FinCoursa", user_action: "PAY_NOW", shipping_preference: "NO_SHIPPING",
          return_url: input.successUrl, cancel_url: input.cancelUrl,
        } } },
      }),
    });
    const link = (order.links ?? []).find((l: any) => l.rel === "payer-action" || l.rel === "approve");
    if (!link) throw new Error("PayPal did not return an approval link");
    return { sessionId: order.id, redirectUrl: link.href };
  },

  async parseWebhook(request, cfg) {
    const ev = await request.json();
    const r = ev?.resource ?? {};
    switch (ev?.event_type) {
      case "CHECKOUT.ORDER.APPROVED":
        return captureOrder(cfg, r.id, "");
      case "PAYMENT.CAPTURE.COMPLETED":
      case "PAYMENT.CAPTURE.DENIED": {
        const paypalOrder = r.supplementary_data?.related_ids?.order_id;
        if (paypalOrder) return captureOrder(cfg, paypalOrder, "");
        break;
      }
      case "PAYMENT.CAPTURE.REFUNDED": {
        // resource is the refund; re-fetch it, then its capture for our order id
        if (!r.id) break;
        const refund = await pp(cfg, `/v2/payments/refunds/${r.id}`);
        let orderId = refund.custom_id as string | undefined;
        if (!orderId) {
          const up = (refund.links ?? []).find((l: any) => l.rel === "up")?.href as string | undefined;
          const captureId = up?.split("/captures/")[1];
          if (captureId) orderId = (await pp(cfg, `/v2/payments/captures/${captureId}`)).custom_id;
        }
        if (refund.status === "COMPLETED" && orderId) {
          return [{ type: "refund.succeeded", eventId: ev.id, orderId, refundId: refund.id,
            amountMinor: fromMajor(refund.amount.value, refund.amount.currency_code), raw: ev }];
        }
        break;
      }
    }
    return [{ type: "ignored", eventId: String(ev?.id ?? `pp:${Date.now()}`), raw: ev }];
  },

  async verify({ orderId, sessionId }, cfg) {
    const events = await captureOrder(cfg, sessionId, "verify:");
    return events.filter((e) => e.type === "payment.succeeded" && e.orderId === orderId);
  },

  async refund({ orderId, sessionId, amountMinor, currency }, cfg) {
    const order = await pp(cfg, `/v2/checkout/orders/${sessionId}`);
    const captureId = order.purchase_units?.[0]?.payments?.captures?.[0]?.id;
    if (!captureId) throw new Error("No PayPal capture found for this order");
    const r = await pp(cfg, `/v2/payments/captures/${captureId}/refund`, {
      method: "POST",
      headers: { "PayPal-Request-Id": `refund-${orderId}-${amountMinor}-${Date.now()}` },
      body: JSON.stringify({ amount: { value: toMajorString(amountMinor, currency), currency_code: currency }, custom_id: orderId }),
    });
    return { refundId: r.id };
  },

  async testConnection(cfg) {
    await token(cfg);
    return `Connected to PayPal ${cfg.values.environment === "live" ? "LIVE" : "sandbox"}.`;
  },
};
