import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/money";
import { simulatePayment } from "../actions";
import { connect } from "@/lib/payments/registry";
import { applyGatewayEvents } from "@/lib/payments/apply";

/** Buyer is back from the provider: ask the provider directly instead of waiting for the webhook. */
async function confirmWithProvider(order: { id: string; gateway: string | null; gateway_session_id: string | null }) {
  if (!order.gateway || !order.gateway_session_id) return false;
  const conn = await connect(order.gateway);
  if (!conn?.gateway.verify) return false;
  try {
    const events = await conn.gateway.verify({ orderId: order.id, sessionId: order.gateway_session_id }, conn.cfg);
    return events.length > 0 && (await applyGatewayEvents(order.gateway, events));
  } catch (e) {
    console.error(`[payments:${order.gateway}] verify on return failed`, e);
    return false;
  }
}

export const metadata: Metadata = { title: "Order", robots: { index: false } };

export default async function SuccessPage({ searchParams }: PageProps<"/checkout/success">) {
  const id = (await searchParams).order;
  if (typeof id !== "string") notFound();
  await requireUser();
  const { data: order } = await (await createClient())
    .from("orders").select("id, number, status, total_minor, currency, gateway, gateway_session_id, order_items(title, course:courses(slug))").eq("id", id).maybeSingle();
  if (!order) notFound();
  const paid = order.status === "paid" || (order.status === "pending" && (await confirmWithProvider(order)));
  const first = order.order_items?.[0];
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  const courseSlug = (first?.course as any)?.slug as string | undefined;

  return (
    <section className="bg-surface">
      <div className="fc-container py-20 lg:py-28">
        <div className="mx-auto max-w-[620px] rounded-2xl bg-white p-8 text-center md:p-12">
          {paid ? (
            <>
              <span aria-hidden className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-accent">
                <svg width="24" height="24" viewBox="0 0 10 10"><path d="M2 5.2 4.1 7.2 8 3" fill="none" stroke="#101827" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </span>
              <h1 className="fc-h2 mt-6 text-ink">You&apos;re enrolled!</h1>
              <p className="mt-4 text-[15px] text-ink/85">Order #{order.number} · {formatMoney(order.total_minor, order.currency)}. Your receipt and tax invoice are on their way to your inbox.</p>
              <div className="mt-8 flex flex-wrap justify-center gap-3">
                <Link href={courseSlug ? `/learn/${courseSlug}` : "/dashboard"} className="fc-btn fc-btn-primary fc-btn-lg">Start learning</Link>
                <Link href="/dashboard/purchases" className="fc-btn fc-btn-outline fc-btn-lg text-ink">View invoice</Link>
              </div>
            </>
          ) : (
            <>
              <span className="fc-pill">Payment</span>
              <h1 className="fc-h2 mt-4 text-ink">Confirming your payment…</h1>
              {order.gateway?.startsWith("custom-") ? (
                <p className="mt-4 text-[15px] text-ink/85">Thanks! We&apos;ll confirm payment for order FC-{order.number} shortly. You&apos;ll get an email and the course appears in your dashboard as soon as it&apos;s confirmed.{" "}
                  <Link href={`/checkout/pay/${order.id}`} className="underline">Payment details</Link></p>
              ) : (
                <p className="mt-4 text-[15px] text-ink/85">This usually takes a few seconds. Refresh this page, or find the course in your dashboard once it&apos;s confirmed.</p>
              )}
              {order.gateway === "manual" && process.env.ALLOW_TEST_PAYMENTS === "true" && (
                <form action={simulatePayment.bind(null, order.id)} className="mt-8">
                  <button className="fc-btn fc-btn-dark fc-btn-lg">Simulate successful payment (test mode)</button>
                </form>
              )}
              <Link href="/dashboard" className="mt-6 block text-sm text-ink underline">Go to my dashboard</Link>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
