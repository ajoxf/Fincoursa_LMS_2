import { NextResponse, type NextRequest } from "next/server";
import { getGateway } from "@/lib/payments/registry";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendReceipt } from "@/lib/email/events";

/**
 * One webhook endpoint per provider: /api/webhooks/payments/{gateway}
 * Every event is stored once (unique gateway+event_id), then applied through
 * idempotent database functions, so provider retries are safe.
 */
export async function POST(request: NextRequest, ctx: RouteContext<"/api/webhooks/payments/[gateway]">) {
  const { gateway: id } = await ctx.params;
  const gateway = getGateway(id);
  if (!gateway || !gateway.isConfigured()) return NextResponse.json({ error: "unknown gateway" }, { status: 404 });

  let events;
  try {
    events = await gateway.parseWebhook(request);
  } catch (e) {
    console.error(`[payments:${id}] webhook rejected`, e);
    return NextResponse.json({ error: "invalid webhook" }, { status: 400 });
  }

  const db = createAdminClient();
  for (const ev of events) {
    const orderId = "orderId" in ev ? ev.orderId : null;
    const { error: dup } = await db.from("payment_events").insert({
      gateway: id, event_id: ev.eventId, order_id: orderId, type: ev.type, payload: ev.raw as object,
    });
    if (dup) continue; // already received

    let err = null;
    if (ev.type === "payment.succeeded") {
      ({ error: err } = await db.rpc("fulfill_order", { p_order: ev.orderId, p_gateway_ref: ev.sessionId ?? null }));
      if (!err) await sendReceipt(ev.orderId).catch((e) => console.error("[email] receipt", e));
    } else if (ev.type === "payment.failed") {
      ({ error: err } = await db.from("orders").update({ status: "failed" }).eq("id", ev.orderId).eq("status", "pending"));
    } else if (ev.type === "refund.succeeded") {
      ({ error: err } = await db.rpc("apply_refund", {
        p_order: ev.orderId, p_amount: ev.amountMinor, p_reason: "gateway refund", p_gateway_refund_id: ev.refundId, p_actor: null,
      }));
    }
    if (err) {
      console.error(`[payments:${id}] failed to apply ${ev.type}`, err);
      // remove the marker so the provider's retry is processed again
      await db.from("payment_events").delete().eq("gateway", id).eq("event_id", ev.eventId);
      return NextResponse.json({ error: "processing failed" }, { status: 500 });
    }
    await db.from("payment_events").update({ processed_at: new Date().toISOString() }).eq("gateway", id).eq("event_id", ev.eventId);
  }
  return NextResponse.json({ received: true });
}
