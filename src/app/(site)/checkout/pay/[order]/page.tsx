import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/money";
import { resolveGateway } from "@/lib/payments/registry";
import { fillPayUrl } from "@/lib/payments/gateways/custom";

export const metadata: Metadata = { title: "Complete your payment", robots: { index: false } };

/** Payment page for providers an admin added without code: instructions + the provider's payment link. */
export default async function PayPage({ params }: PageProps<"/checkout/pay/[order]">) {
  const { order: id } = await params;
  const user = await requireUser(`/checkout/pay/${id}`);
  const { data: order } = await (await createClient())
    .from("orders").select("id, number, status, total_minor, currency, gateway, order_items(title)").eq("id", id).maybeSingle();
  if (!order) notFound();
  if (order.status !== "pending") redirect(`/checkout/success?order=${order.id}`);
  const gw = order.gateway ? await resolveGateway(order.gateway) : undefined;
  if (!gw?.custom) redirect(`/checkout/success?order=${order.id}`);
  const c = gw.custom;
  const payUrl = c.pay_url
    ? fillPayUrl(c.pay_url, { amountMinor: order.total_minor, currency: order.currency, orderNumber: order.number, orderId: order.id, email: user.email ?? "" })
    : null;
  const total = formatMoney(order.total_minor, order.currency);

  return (
    <section className="bg-surface">
      <div className="fc-container py-20 lg:py-28">
        <div className="mx-auto max-w-[620px] rounded-2xl bg-white p-8 md:p-12">
          <span className="fc-pill">Payment</span>
          <h1 className="fc-h2 mt-4 text-ink">{c.label}</h1>
          <dl className="mt-6 grid gap-3 rounded-xl bg-surface p-5 text-[15px]">
            <div className="flex justify-between gap-4"><dt className="text-ink/70">Course</dt><dd className="text-right font-medium">{order.order_items?.map((i) => i.title).join(", ")}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-ink/70">Amount to pay</dt><dd className="font-bold">{total}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-ink/70">Payment reference</dt><dd className="font-mono font-bold">FC-{order.number}</dd></div>
          </dl>
          {c.instructions && <p className="mt-6 whitespace-pre-line text-[15px] leading-relaxed text-ink/85">{c.instructions}</p>}
          <p className="mt-4 text-sm text-ink/70">Please pay exactly <b>{total}</b> and include the reference <b>FC-{order.number}</b> so we can match your payment.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            {payUrl && <a href={payUrl} target="_blank" rel="noopener noreferrer" className="fc-btn fc-btn-primary fc-btn-lg">Pay {total} →</a>}
            <Link href={`/checkout/success?order=${order.id}`} className="fc-btn fc-btn-outline fc-btn-lg text-ink">I&apos;ve paid</Link>
          </div>
          <p className="mt-6 text-xs text-ink/60">Your course unlocks as soon as the payment is confirmed, and your receipt is emailed to you.</p>
        </div>
      </div>
    </section>
  );
}
