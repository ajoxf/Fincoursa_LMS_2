/**
 * TEMPLATE for a new regional gateway (e.g. Telr, Tap, Network International N-Genius,
 * Checkout.com, PayTabs, PayPal, Razorpay).
 *
 * 1. Copy this file to gateways/<id>.ts and implement the four methods using the provider's API.
 * 2. Add it to the `gateways` list in registry.ts.
 * 3. Add its env vars to .env.example and Vercel.
 * 4. In the provider dashboard, point the webhook/callback to  https://<site>/api/webhooks/payments/<id>
 * 5. Route buyers to it with a row in `payment_routes`, e.g. ('AE', 'AED', '<id>', 10).
 *
 * Rules every adapter must follow:
 * - Put our orderId in the provider's reference/metadata field so webhooks can find the order.
 * - parseWebhook MUST verify the provider's signature (or re-fetch the transaction from the
 *   provider's API) before returning payment.succeeded — never trust the redirect alone.
 * - eventId must be stable for retries of the same event (idempotency).
 */
import type { PaymentGateway } from "../types";

export const templateGateway: PaymentGateway = {
  id: "template",
  label: "Pay with …",
  currencies: ["AED", "SAR", "USD"],
  isConfigured: () => false,
  async createCheckout() {
    throw new Error("not implemented");
  },
  async parseWebhook() {
    throw new Error("not implemented");
  },
};
