import type { PaymentGateway } from "../types";

/**
 * Test payments let a buyer "pay" without money moving, so they are never allowed on the live site
 * (Vercel production), whatever ALLOW_TEST_PAYMENTS says. Preview deployments and local dev can still use them.
 */
export const testPaymentsAllowed = () => process.env.ALLOW_TEST_PAYMENTS === "true" && process.env.VERCEL_ENV !== "production";

/**
 * Built-in test gateway: no money moves. The success page shows a "Simulate payment" button
 * which fulfils the order. Only enabled when ALLOW_TEST_PAYMENTS=true, and never on the live site.
 */
export const manualGateway: PaymentGateway = {
  id: "manual",
  name: "Test payments",
  label: "Test payment",
  regions: "Testing only: no money moves",
  keysHelp: "Turned on by ALLOW_TEST_PAYMENTS=true in Vercel. Set it to false before launch.",
  webhookEvents: [],
  fields: [],
  currencies: null,
  isConfigured: () => testPaymentsAllowed(),
  async createCheckout(input) {
    return {
      sessionId: `manual_${input.orderId}`,
      redirectUrl: `${input.successUrl}${input.successUrl.includes("?") ? "&" : "?"}test=1`,
    };
  },
  async parseWebhook() {
    return []; // fulfilment happens through the simulate action
  },
};
