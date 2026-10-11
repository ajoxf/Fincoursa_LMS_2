import Stripe from "stripe";
import type { GatewayConfig, GatewayEvent, PaymentGateway } from "../types";

const clients = new Map<string, Stripe>();
const stripe = (cfg: GatewayConfig) => {
  const key = cfg.values.secret_key;
  if (!clients.has(key)) clients.set(key, new Stripe(key));
  return clients.get(key)!;
};

/** Stripe Checkout (hosted). Cards, Apple Pay and Google Pay. Available to UAE businesses. */
export const stripeGateway: PaymentGateway = {
  id: "stripe",
  name: "Stripe",
  label: "Card / Apple Pay / Google Pay",
  regions: "Global cards, Apple Pay, Google Pay (UAE-registered businesses supported)",
  keysHelp: "Stripe Dashboard → Developers → API keys (secret key). Then Developers → Webhooks → Add endpoint → copy its signing secret.",
  webhookEvents: ["checkout.session.completed", "checkout.session.async_payment_succeeded", "checkout.session.async_payment_failed", "checkout.session.expired", "refund.created", "refund.updated"],
  fields: [
    { key: "secret_key", label: "Secret key", secret: true, required: true, env: "STRIPE_SECRET_KEY", placeholder: "sk_live_… or sk_test_…" },
    { key: "webhook_secret", label: "Webhook signing secret", secret: true, required: true, env: "STRIPE_WEBHOOK_SECRET", placeholder: "whsec_…" },
  ],
  currencies: null,

  async createCheckout(input, cfg) {
    const session = await stripe(cfg).checkout.sessions.create({
      mode: "payment",
      client_reference_id: input.orderId,
      customer_email: input.customer.email,
      metadata: { order_id: input.orderId, order_number: String(input.orderNumber) },
      payment_intent_data: { metadata: { order_id: input.orderId } },
      line_items: input.lines.map((l) => ({
        quantity: l.quantity,
        price_data: { currency: input.currency.toLowerCase(), unit_amount: l.amountMinor, product_data: { name: l.title } },
      })),
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
    });
    return { sessionId: session.id, redirectUrl: session.url! };
  },

  async parseWebhook(request, cfg) {
    const body = await request.text();
    const event = stripe(cfg).webhooks.constructEvent(body, request.headers.get("stripe-signature") ?? "", cfg.values.webhook_secret);
    const out: GatewayEvent[] = [];
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const s = event.data.object;
        if (s.payment_status === "paid" && s.metadata?.order_id) {
          out.push({ type: "payment.succeeded", eventId: event.id, orderId: s.metadata.order_id, sessionId: s.id, raw: event });
        } else out.push({ type: "ignored", eventId: event.id, raw: event });
        break;
      }
      case "checkout.session.async_payment_failed":
      case "checkout.session.expired": {
        const s = event.data.object;
        if (s.metadata?.order_id) out.push({ type: "payment.failed", eventId: event.id, orderId: s.metadata.order_id, raw: event });
        break;
      }
      case "refund.created":
      case "refund.updated": {
        const r = event.data.object;
        if (r.status === "succeeded" && r.payment_intent) {
          const pi = await stripe(cfg).paymentIntents.retrieve(String(r.payment_intent));
          if (pi.metadata?.order_id) {
            out.push({ type: "refund.succeeded", eventId: event.id, orderId: pi.metadata.order_id, refundId: r.id, amountMinor: r.amount, raw: event });
          }
        }
        break;
      }
      default:
        out.push({ type: "ignored", eventId: event.id, raw: event });
    }
    return out;
  },

  async verify({ orderId, sessionId }, cfg) {
    const s = await stripe(cfg).checkout.sessions.retrieve(sessionId);
    if (s.payment_status !== "paid" || s.metadata?.order_id !== orderId) return [];
    return [{ type: "payment.succeeded", eventId: `verify:${s.id}`, orderId, sessionId: s.id, raw: { session: s.id, payment_status: s.payment_status } }];
  },

  async refund({ sessionId, amountMinor }, cfg) {
    const session = await stripe(cfg).checkout.sessions.retrieve(sessionId);
    const refund = await stripe(cfg).refunds.create({ payment_intent: String(session.payment_intent), amount: amountMinor });
    return { refundId: refund.id };
  },

  async testConnection(cfg) {
    const bal = await stripe(cfg).balance.retrieve();
    const mode = cfg.values.secret_key.startsWith("sk_test_") || cfg.values.secret_key.startsWith("rk_test_") ? "test mode" : "LIVE mode";
    return `Connected to Stripe in ${mode} (${bal.available.map((b) => b.currency.toUpperCase()).join(", ") || "no balance yet"}).`;
  },
};
