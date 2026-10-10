import Stripe from "stripe";
import type { GatewayEvent, PaymentGateway } from "../types";

let client: Stripe | null = null;
const stripe = () => (client ??= new Stripe(process.env.STRIPE_SECRET_KEY!));

/** Stripe Checkout (hosted). Cards, Apple Pay and Google Pay. Available to UAE businesses. */
export const stripeGateway: PaymentGateway = {
  id: "stripe",
  label: "Card / Apple Pay / Google Pay",
  currencies: null,
  isConfigured: () => Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET),

  async createCheckout(input) {
    const session = await stripe().checkout.sessions.create({
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

  async parseWebhook(request) {
    const body = await request.text();
    const event = stripe().webhooks.constructEvent(body, request.headers.get("stripe-signature") ?? "", process.env.STRIPE_WEBHOOK_SECRET!);
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
          const pi = await stripe().paymentIntents.retrieve(String(r.payment_intent));
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

  async refund({ sessionId, amountMinor }) {
    const session = await stripe().checkout.sessions.retrieve(sessionId);
    const refund = await stripe().refunds.create({ payment_intent: String(session.payment_intent), amount: amountMinor });
    return { refundId: refund.id };
  },
};
