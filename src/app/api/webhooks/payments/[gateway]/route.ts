import { NextResponse, type NextRequest } from "next/server";
import { connect } from "@/lib/payments/registry";
import { applyGatewayEvents } from "@/lib/payments/apply";

/**
 * One webhook endpoint per provider: /api/webhooks/payments/{gateway}
 * The adapter verifies the call (signature, or re-fetching from the provider), then events are
 * applied idempotently, so provider retries are safe.
 */
export async function POST(request: NextRequest, ctx: RouteContext<"/api/webhooks/payments/[gateway]">) {
  const { gateway: id } = await ctx.params;
  const conn = await connect(id);
  if (!conn) return NextResponse.json({ error: "unknown gateway" }, { status: 404 });

  let events;
  try {
    events = await conn.gateway.parseWebhook(request, conn.cfg);
  } catch (e) {
    console.error(`[payments:${id}] webhook rejected`, e);
    return NextResponse.json({ error: "invalid webhook" }, { status: 400 });
  }

  if (!(await applyGatewayEvents(id, events))) return NextResponse.json({ error: "processing failed" }, { status: 500 });
  return NextResponse.json({ received: true });
}
