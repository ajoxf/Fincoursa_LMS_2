/**
 * Every payment provider (Stripe, Telr, Tap, Network International, Checkout.com, PayPal, …)
 * is wrapped in this one interface. Checkout, fulfilment and reporting never talk to a
 * provider directly, so adding a region's gateway is: write an adapter, register it,
 * add a row to `payment_routes`.
 */
export type CheckoutLine = { title: string; amountMinor: number; quantity: number };

export type CheckoutInput = {
  orderId: string;
  orderNumber: number;
  currency: string;          // ISO 4217, upper case
  totalMinor: number;        // what the buyer pays, tax included
  lines: CheckoutLine[];     // already discounted; sums to totalMinor
  customer: { id: string; email: string; name?: string | null; country?: string | null };
  successUrl: string;        // buyer returns here after paying (may arrive before the webhook)
  cancelUrl: string;
};

export type CheckoutSession = { sessionId: string; redirectUrl: string };

/** Normalised webhook events. `eventId` must be unique per provider (used for idempotency). */
export type GatewayEvent =
  | { type: "payment.succeeded"; eventId: string; orderId: string; sessionId?: string; raw: unknown }
  | { type: "payment.failed"; eventId: string; orderId: string; raw: unknown }
  | { type: "refund.succeeded"; eventId: string; orderId: string; refundId: string; amountMinor: number; raw: unknown }
  | { type: "ignored"; eventId: string; raw: unknown };

export interface PaymentGateway {
  /** Matches `payment_routes.gateway` and the webhook URL: /api/webhooks/payments/{id} */
  id: string;
  /** Shown to buyers when more than one method is available */
  label: string;
  /** False when its env vars are missing — the router skips it */
  isConfigured(): boolean;
  /** Currencies this provider can charge in (null = any) */
  currencies: string[] | null;
  createCheckout(input: CheckoutInput): Promise<CheckoutSession>;
  /** Verify the signature and translate the provider payload. Throw on a bad signature. */
  parseWebhook(request: Request): Promise<GatewayEvent[]>;
  /** Optional: issue a refund from the admin panel. The provider's refund webhook then records it. */
  refund?(args: { orderId: string; sessionId: string; amountMinor: number; currency: string }): Promise<{ refundId: string }>;
}
