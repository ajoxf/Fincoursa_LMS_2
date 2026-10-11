import { createHmac, timingSafeEqual } from "node:crypto";
import type { GatewayConfig, GatewayEvent, PaymentGateway } from "../types";
import { basicAuth, callJson } from "../http";

/* eslint-disable @typescript-eslint/no-explicit-any */
const API = "https://api.razorpay.com/v1";
const rzp = (cfg: GatewayConfig, path: string, init: RequestInit = {}) =>
  callJson<any>("Razorpay", `${API}${path}`, {
    ...init,
    headers: { Authorization: basicAuth(cfg.values.key_id, cfg.values.key_secret), "Content-Type": "application/json", ...init.headers },
  });

/** The captured payment behind a payment link. */
async function linkPayment(cfg: GatewayConfig, linkId: string): Promise<string | null> {
  const link = await rzp(cfg, `/payment_links/${linkId}`);
  return (link.payments ?? []).find((p: any) => p.status === "captured")?.payment_id ?? null;
}

/**
 * Razorpay Payment Links (hosted page): UPI, cards, netbanking and wallets for India.
 * International cards and currencies need "International payments" enabled on the Razorpay account.
 */
export const razorpayGateway: PaymentGateway = {
  id: "razorpay",
  name: "Razorpay",
  label: "UPI / Cards / Netbanking (India)",
  regions: "India: UPI, RuPay and other cards, netbanking, wallets (INR; other currencies with international payments on)",
  keysHelp: "Razorpay Dashboard → Account & Settings → API Keys (Key ID + Key Secret). Then Webhooks → Add new webhook → set a secret.",
  webhookEvents: ["payment_link.paid", "payment_link.cancelled", "payment_link.expired", "refund.processed"],
  fields: [
    { key: "key_id", label: "Key ID", secret: false, required: true, env: "RAZORPAY_KEY_ID", placeholder: "rzp_live_… or rzp_test_…" },
    { key: "key_secret", label: "Key secret", secret: true, required: true, env: "RAZORPAY_KEY_SECRET" },
    { key: "webhook_secret", label: "Webhook secret", secret: true, required: true, env: "RAZORPAY_WEBHOOK_SECRET", help: "The secret you typed when creating the webhook in Razorpay." },
  ],
  currencies: ["INR", "USD", "EUR", "GBP", "AED", "SGD", "AUD", "CAD"],

  async createCheckout(input, cfg) {
    const link = await rzp(cfg, "/payment_links", {
      method: "POST",
      body: JSON.stringify({
        amount: input.totalMinor,
        currency: input.currency,
        accept_partial: false,
        reference_id: input.orderId,
        description: input.lines.map((l) => l.title).join(", ").slice(0, 2000),
        customer: { name: input.customer.name ?? undefined, email: input.customer.email },
        notify: { sms: false, email: false },
        reminder_enable: false,
        notes: { order_id: input.orderId, order_number: String(input.orderNumber) },
        callback_url: input.successUrl,
        callback_method: "get",
      }),
    });
    return { sessionId: link.id, redirectUrl: link.short_url };
  },

  async parseWebhook(request, cfg) {
    const body = await request.text();
    const sig = request.headers.get("x-razorpay-signature") ?? "";
    const expected = createHmac("sha256", cfg.values.webhook_secret).update(body).digest("hex");
    if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) throw new Error("bad signature");
    const ev = JSON.parse(body);
    const eventId = request.headers.get("x-razorpay-event-id") ?? `${ev.event}:${ev.payload?.payment_link?.entity?.id ?? ev.payload?.refund?.entity?.id}:${ev.created_at}`;
    const link = ev.payload?.payment_link?.entity;
    const orderId = link?.notes?.order_id ?? link?.reference_id;

    if (ev.event === "payment_link.paid" && orderId) {
      return [{ type: "payment.succeeded", eventId, orderId, sessionId: link.id, raw: ev }];
    }
    if ((ev.event === "payment_link.cancelled" || ev.event === "payment_link.expired") && orderId) {
      return [{ type: "payment.failed", eventId, orderId, raw: ev }];
    }
    if (ev.event === "refund.processed") {
      const r = ev.payload?.refund?.entity;
      let refundOrder = r?.notes?.order_id as string | undefined;
      if (!refundOrder && r?.payment_id) refundOrder = (await rzp(cfg, `/payments/${r.payment_id}`)).notes?.order_id;
      if (refundOrder) return [{ type: "refund.succeeded", eventId, orderId: refundOrder, refundId: r.id, amountMinor: r.amount, raw: ev }];
    }
    return [{ type: "ignored", eventId, raw: ev }];
  },

  async verify({ orderId, sessionId }, cfg) {
    const link = await rzp(cfg, `/payment_links/${sessionId}`);
    if (link.status !== "paid" || (link.notes?.order_id ?? link.reference_id) !== orderId) return [];
    return [{ type: "payment.succeeded", eventId: `verify:${link.id}`, orderId, sessionId: link.id, raw: { link: link.id, status: link.status } }] satisfies GatewayEvent[];
  },

  async refund({ orderId, sessionId, amountMinor }, cfg) {
    const paymentId = await linkPayment(cfg, sessionId);
    if (!paymentId) throw new Error("No captured Razorpay payment found for this order");
    const r = await rzp(cfg, `/payments/${paymentId}/refund`, { method: "POST", body: JSON.stringify({ amount: amountMinor, notes: { order_id: orderId } }) });
    return { refundId: r.id };
  },

  async testConnection(cfg) {
    await rzp(cfg, "/payments?count=1");
    return `Connected to Razorpay in ${cfg.values.key_id.startsWith("rzp_test_") ? "test mode" : "LIVE mode"}.`;
  },
};
