import type { PaymentGateway } from "../types";

/**
 * Built-in test gateway: no money moves. The success page shows a "Simulate payment" button
 * which fulfils the order. Only enabled when ALLOW_TEST_PAYMENTS=true — never in production.
 */
export const manualGateway: PaymentGateway = {
  id: "manual",
  label: "Test payment",
  currencies: null,
  isConfigured: () => process.env.ALLOW_TEST_PAYMENTS === "true",
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
