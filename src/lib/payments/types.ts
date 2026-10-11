/**
 * Every payment provider (Stripe, Razorpay, Tap, PayPal, Telr, Checkout.com, …) is wrapped in this one
 * interface. Checkout, fulfilment and reporting never talk to a provider directly, so adding a region's
 * gateway is: write an adapter, register it, enter its keys on /admin/payments, add a route.
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
  webhookUrl: string;        // for providers that take the callback URL per payment
};

export type CheckoutSession = { sessionId: string; redirectUrl: string };

/** Normalised webhook events. `eventId` must be unique per provider (used for idempotency). */
export type GatewayEvent =
  | { type: "payment.succeeded"; eventId: string; orderId: string; sessionId?: string; raw: unknown }
  | { type: "payment.failed"; eventId: string; orderId: string; raw: unknown }
  | { type: "refund.succeeded"; eventId: string; orderId: string; refundId: string; amountMinor: number; raw: unknown }
  | { type: "ignored"; eventId: string; raw: unknown };

/** One key/setting an admin enters for a provider. */
export type CredentialField = {
  key: string;
  label: string;
  /** Secret values are encrypted at rest and never sent back to the browser */
  secret: boolean;
  required: boolean;
  /** Older setups can keep the value in a Vercel environment variable instead */
  env?: string;
  placeholder?: string;
  /** Drop-down instead of a text box */
  options?: string[];
  help?: string;
};

/** Keys and settings for one provider, from /admin/payments (or Vercel env vars as a fallback). */
export type GatewayConfig = {
  values: Record<string, string>;
  enabled: boolean;
};

export interface PaymentGateway {
  /** Matches `payment_routes.gateway` and the webhook URL: /api/webhooks/payments/{id} */
  id: string;
  /** Provider name on the admin screen */
  name: string;
  /** Shown to buyers when more than one method is available */
  label: string;
  /** Where it's typically used, for the admin screen */
  regions: string;
  /** Where to find the keys in the provider's dashboard */
  keysHelp: string;
  /** Webhook events to subscribe to in the provider's dashboard (empty if none needed) */
  webhookEvents: string[];
  fields: CredentialField[];
  /** Currencies this provider can charge in (null = any) */
  currencies: string[] | null;
  /** Override the default "all required fields present" check */
  isConfigured?(cfg: GatewayConfig): boolean;
  createCheckout(input: CheckoutInput, cfg: GatewayConfig): Promise<CheckoutSession>;
  /** Verify the signature (or re-fetch from the provider) and translate the payload. Throw if it can't be trusted. */
  parseWebhook(request: Request, cfg: GatewayConfig): Promise<GatewayEvent[]>;
  /** Optional: when the buyer comes back, ask the provider directly whether this checkout was paid. */
  verify?(args: { orderId: string; sessionId: string }, cfg: GatewayConfig): Promise<GatewayEvent[]>;
  /** Optional: issue a refund from the admin panel. The provider's refund webhook then records it. */
  refund?(args: { orderId: string; sessionId: string; amountMinor: number; currency: string }, cfg: GatewayConfig): Promise<{ refundId: string }>;
  /** Optional: a harmless API call proving the keys work. Returns a short description, throws on failure. */
  testConnection?(cfg: GatewayConfig): Promise<string>;
}
