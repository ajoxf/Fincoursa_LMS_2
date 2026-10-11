import { createHmac, timingSafeEqual } from "node:crypto";
import type { CustomGatewayRow, GatewayEvent, PaymentGateway } from "../types";
import { toMajorString } from "@/lib/money";
import { env } from "@/lib/env";

/** Values an admin can put in a custom provider's payment link. */
export const PAY_URL_PLACEHOLDERS = ["{amount}", "{amount_minor}", "{currency}", "{order_number}", "{order_id}", "{email}"] as const;

export function fillPayUrl(template: string, o: { amountMinor: number; currency: string; orderNumber: number; orderId: string; email: string }) {
  const v: Record<string, string> = {
    amount: toMajorString(o.amountMinor, o.currency), amount_minor: String(o.amountMinor), currency: o.currency,
    order_number: String(o.orderNumber), order_id: o.orderId, email: o.email,
  };
  return template.replace(/\{(amount|amount_minor|currency|order_number|order_id|email)\}/g, (_, k) => encodeURIComponent(v[k]));
}

/**
 * A provider added on /admin/payments without code. The buyer goes to our payment page, which shows the
 * provider's instructions and payment link. The order is confirmed either by a signed webhook
 * (from the provider, or from an automation tool such as Zapier or Make) or by an admin pressing
 * "Mark as paid" on the Orders page.
 *
 * Webhook: POST JSON {"order_number": 1234 | "order_id": "...", "status": "paid" | "failed", "reference": "..."}
 * with header X-Signature = hex HMAC-SHA256 of the raw body using the provider's webhook secret.
 */
export function makeCustomGateway(row: CustomGatewayRow): PaymentGateway {
  return {
    id: row.id,
    name: row.name,
    label: row.label,
    regions: "Added by an admin",
    keysHelp: "Optional: set a webhook secret if the provider (or an automation tool like Zapier or Make) will confirm payments automatically. Without it, confirm each payment with \"Mark as paid\" on the Orders page.",
    webhookEvents: [],
    fields: [{ key: "webhook_secret", label: "Webhook secret (optional)", secret: true, required: false, placeholder: "any long random text" }],
    currencies: row.currencies?.length ? row.currencies : null,
    isConfigured: () => true,
    custom: row,

    async createCheckout(input) {
      return { sessionId: `custom_${input.orderId}`, redirectUrl: `${env.siteUrl}/checkout/pay/${input.orderId}` };
    },

    async parseWebhook(request, cfg) {
      const secret = cfg.values.webhook_secret;
      if (!secret) throw new Error("no webhook secret set for this provider");
      const body = await request.text();
      const sig = (request.headers.get("x-signature") ?? "").replace(/^sha256=/, "");
      const expected = createHmac("sha256", secret).update(body).digest("hex");
      if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) throw new Error("bad signature");
      const ev = JSON.parse(body) as { order_id?: string; order_number?: number | string; status?: string; reference?: string };
      const status = String(ev.status ?? "").toLowerCase();
      // "#1234" (order number) is resolved to the order id when the event is applied
      const orderRef = ev.order_id ?? (ev.order_number !== undefined ? `#${ev.order_number}` : "");
      if (!orderRef) throw new Error("order_id or order_number is required");
      if (ev.order_id && !/^[0-9a-f-]{36}$/i.test(ev.order_id)) throw new Error("order_id is not a valid id");
      if (!ev.order_id && !/^#\d+$/.test(orderRef)) throw new Error("order_number must be a number");
      const eventId = request.headers.get("x-event-id") ?? `${orderRef}:${status}:${ev.reference ?? ""}`;
      const out: GatewayEvent[] = status === "paid" || status === "succeeded" || status === "completed"
        ? [{ type: "payment.succeeded", eventId, orderId: orderRef, sessionId: ev.reference ? `${row.id}:${ev.reference}` : undefined, raw: ev }]
        : status === "failed" || status === "cancelled" || status === "canceled"
          ? [{ type: "payment.failed", eventId, orderId: orderRef, raw: ev }]
          : [{ type: "ignored", eventId, raw: ev }];
      return out;
    },
  };
}
