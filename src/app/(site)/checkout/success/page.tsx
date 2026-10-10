import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/money";
import { simulatePayment } from "../actions";

export const metadata: Metadata = { title: "Order", robots: { index: false } };

export default async function SuccessPage({ searchParams }: PageProps<"/checkout/success">) {
  const id = (await searchParams).order;
  if (typeof id !== "string") notFound();
  await requireUser();
  const { data: order } = await (await createClient())
    .from("orders").select("id, number, status, total_minor, currency, gateway, order_items(title, course:courses(slug))").eq("id", id).maybeSingle();
  if (!order) notFound();
  const paid = order.status === "paid";
  const first = order.order_items?.[0];
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  const courseSlug = (first?.course as any)?.slug as string | undefined;

  return (
    <section className="fc-container max-w-xl py-20 text-center">
      {paid ? (
        <>
          <p className="text-5xl">🎉</p>
          <h1 className="mt-4 text-3xl font-bold text-primary">You&apos;re enrolled!</h1>
          <p className="mt-3 text-muted">Order #{order.number} · {formatMoney(order.total_minor, order.currency)}. A receipt is on its way to your inbox.</p>
          <Link href={courseSlug ? `/learn/${courseSlug}` : "/dashboard"} className="fc-btn fc-btn-primary mt-8">Start learning</Link>
        </>
      ) : (
        <>
          <h1 className="text-3xl font-bold text-primary">Confirming your payment…</h1>
          <p className="mt-3 text-muted">This usually takes a few seconds. Refresh this page, or find the course in your dashboard once it&apos;s confirmed.</p>
          {order.gateway === "manual" && process.env.ALLOW_TEST_PAYMENTS === "true" && (
            <form action={simulatePayment.bind(null, order.id)} className="mt-8">
              <button className="fc-btn fc-btn-dark">Simulate successful payment (test mode)</button>
            </form>
          )}
          <Link href="/dashboard" className="mt-6 block text-sm text-primary underline">Go to my dashboard</Link>
        </>
      )}
    </section>
  );
}
