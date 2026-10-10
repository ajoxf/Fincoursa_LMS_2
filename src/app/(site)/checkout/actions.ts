"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { buildQuote, resolveAffiliate } from "@/lib/checkout";
import { gatewaysFor, getGateway } from "@/lib/payments/registry";
import { createAdminClient } from "@/lib/supabase/admin";
import { env } from "@/lib/env";

export async function startCheckout(form: FormData) {
  const s = (k: string) => (String(form.get(k) ?? "").trim() || undefined);
  const user = await requireUser("/pages/paid-courses");
  const country = s("country")?.toUpperCase() ?? null;
  const quote = await buildQuote({ courseSlug: s("course"), bundleSlug: s("bundle"), couponCode: s("coupon"), country });
  if (!quote) throw new Error("Item not found");

  const db = createAdminClient();
  const affiliateId = await resolveAffiliate((await cookies()).get("fc_ref")?.value, user.id);

  let gatewayId: string | null = null;
  if (quote.totalMinor > 0) {
    const allowed = await gatewaysFor(country, quote.currency);
    const chosen = allowed.find((g) => g.id === s("gateway")) ?? allowed[0];
    if (!chosen) throw new Error("No payment method available");
    gatewayId = chosen.id;
  }

  const { data: order, error } = await db.from("orders").insert({
    user_id: user.id, currency: quote.currency,
    subtotal_minor: quote.subtotalMinor, discount_minor: quote.discountMinor, tax_minor: quote.taxMinor, total_minor: quote.totalMinor,
    tax_rate: quote.taxRate, billing_country: country, coupon_id: quote.coupon?.id ?? null,
    affiliate_id: affiliateId, gateway: gatewayId ?? "free",
  }).select("id, number").single();
  if (error || !order) throw new Error("Could not create order");

  await db.from("order_items").insert({
    order_id: order.id, title: quote.item.title, price_id: quote.item.priceId,
    course_id: quote.item.kind === "course" ? quote.item.id : null,
    bundle_id: quote.item.kind === "bundle" ? quote.item.id : null,
    unit_amount_minor: quote.subtotalMinor, discount_minor: quote.discountMinor, quantity: 1,
  });
  if (country) await db.from("profiles").update({ country_code: country }).eq("id", user.id);

  // Free (e.g. 100% coupon): fulfil immediately
  if (quote.totalMinor === 0) {
    await db.rpc("fulfill_order", { p_order: order.id, p_gateway_ref: "free" });
    redirect(`/checkout/success?order=${order.id}`);
  }

  const gateway = getGateway(gatewayId!)!;
  const session = await gateway.createCheckout({
    orderId: order.id, orderNumber: order.number, currency: quote.currency, totalMinor: quote.totalMinor,
    lines: [{ title: quote.item.title, amountMinor: quote.totalMinor, quantity: 1 }],
    customer: { id: user.id, email: user.email ?? "", name: user.fullName, country },
    successUrl: `${env.siteUrl}/checkout/success?order=${order.id}`,
    cancelUrl: `${env.siteUrl}/checkout?${quote.item.kind}=${quote.item.slug}`,
  });
  await db.from("orders").update({ gateway_session_id: session.sessionId }).eq("id", order.id);
  redirect(session.redirectUrl);
}

/** Test gateway only: simulate a successful payment. */
export async function simulatePayment(orderId: string) {
  const user = await requireUser();
  if (process.env.ALLOW_TEST_PAYMENTS !== "true") throw new Error("Test payments are disabled");
  const db = createAdminClient();
  const { data: order } = await db.from("orders").select("user_id, gateway").eq("id", orderId).single();
  if (!order || order.user_id !== user.id || order.gateway !== "manual") throw new Error("Not allowed");
  await db.rpc("fulfill_order", { p_order: orderId, p_gateway_ref: `manual_${orderId}` });
  redirect(`/checkout/success?order=${orderId}`);
}
