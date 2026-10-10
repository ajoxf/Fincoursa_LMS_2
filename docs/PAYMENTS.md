# Payments: adding a gateway

Checkout never talks to a provider directly. Each provider is an adapter implementing
`PaymentGateway` (`src/lib/payments/types.ts`):

| Method | Job |
|---|---|
| `createCheckout` | Create the provider's hosted payment page for an order; return its URL |
| `parseWebhook` | Verify the signature, translate the payload into `payment.succeeded` / `payment.failed` / `refund.succeeded` |
| `refund` (optional) | Issue refunds from the admin panel |
| `isConfigured` | False when env vars are missing, so it is never offered |

Included: **stripe** (cards, Apple Pay, Google Pay) and **manual** (test-only, `ALLOW_TEST_PAYMENTS=true`).

## Steps for a new gateway (e.g. Telr, Tap, Network International, Checkout.com, PayTabs, PayPal)

1. Copy `src/lib/payments/gateways/_template.ts` to `gateways/<id>.ts` and implement it.
2. Register it in `src/lib/payments/registry.ts`.
3. Add its keys to `.env.example` and Vercel.
4. Point the provider's webhook / IPN to `https://<site>/api/webhooks/payments/<id>`.
5. Route buyers to it:

```sql
-- UAE buyers paying in AED → Telr first, Stripe as a fallback; everyone else → Stripe
insert into payment_routes (country_code, currency, gateway, priority) values
  ('AE', 'AED', 'telr', 10),
  ('AE', 'AED', 'stripe', 20),
  (null, null, 'stripe', 100);
```

The most specific match (country + currency) wins, then priority. When several gateways match,
the buyer chooses between them at checkout.
