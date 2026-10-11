import "server-only";
import type { GatewayEvent } from "./types";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendReceipt, sendRefund } from "@/lib/email/events";

/**
 * Apply provider events to orders. Every event is stored once (unique gateway+event_id), then applied
 * through idempotent database functions, so retries and duplicate events are safe.
 * Returns false if something failed and the provider should retry.
 */
export async function applyGatewayEvents(gatewayId: string, events: GatewayEvent[]): Promise<boolean> {
  const db = createAdminClient();
  for (let ev of events) {
    // "#1234" means order number 1234 (custom providers); turn it into the order id
    if ("orderId" in ev && ev.orderId.startsWith("#")) {
      const { data: o } = await db.from("orders").select("id").eq("number", Number(ev.orderId.slice(1)) || -1).maybeSingle();
      if (!o) { console.error(`[payments:${gatewayId}] unknown order ${ev.orderId}`); continue; }
      ev = { ...ev, orderId: o.id };
    }
    const orderId = "orderId" in ev ? ev.orderId : null;
    const { error: dup } = await db.from("payment_events").insert({
      gateway: gatewayId, event_id: ev.eventId, order_id: orderId, type: ev.type, payload: ev.raw as object,
    });
    if (dup) continue; // already received

    let err = null;
    if (ev.type === "payment.succeeded") {
      // the order must belong to this provider
      const { data: o } = await db.from("orders").select("gateway").eq("id", ev.orderId).maybeSingle();
      if (o?.gateway !== gatewayId) {
        console.error(`[payments:${gatewayId}] event for order ${ev.orderId} placed with ${o?.gateway ?? "unknown"}`);
      } else {
        let first = false;
        ({ data: first, error: err } = await db.rpc("fulfill_order", { p_order: ev.orderId, p_gateway_ref: ev.sessionId ?? null }));
        // fulfill_order returns false when the order was already paid: send the receipt only once
        if (!err && first) await sendReceipt(ev.orderId).catch((e) => console.error("[email] receipt", e));
      }
    } else if (ev.type === "payment.failed") {
      ({ error: err } = await db.from("orders").update({ status: "failed" }).eq("id", ev.orderId).eq("status", "pending"));
    } else if (ev.type === "refund.succeeded") {
      ({ error: err } = await db.rpc("apply_refund", {
        p_order: ev.orderId, p_amount: ev.amountMinor, p_reason: "gateway refund", p_gateway_refund_id: ev.refundId, p_actor: null,
      }));
      if (!err) await sendRefund(ev.orderId).catch((e) => console.error("[email] refund", e));
    }
    if (err) {
      console.error(`[payments:${gatewayId}] failed to apply ${ev.type}`, err);
      // remove the marker so the provider's retry is processed again
      await db.from("payment_events").delete().eq("gateway", gatewayId).eq("event_id", ev.eventId);
      return false;
    }
    await db.from("payment_events").update({ processed_at: new Date().toISOString() }).eq("gateway", gatewayId).eq("event_id", ev.eventId);
  }
  return true;
}
