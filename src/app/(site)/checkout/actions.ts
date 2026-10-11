"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { buildQuote, resolveAttribution } from "@/lib/checkout";
import { connect, gatewaysFor } from "@/lib/payments/registry";
import { createAdminClient } from "@/lib/supabase/admin";
import { env } from "@/lib/env";
import { after } from "next/server";
import { allow, LIMITS, TOO_MANY } from "@/lib/rate-limit";
import { sendEnrolledForOrder, sendPaymentPending, sendReceipt } from "@/lib/email/events";
import { applyGatewayEvents } from "@/lib/payments/apply";

export async function startCheckout(form: FormData) {
  const s = (k: string) => (String(form.get(k) ?? "").trim() || undefined);
  const user = await requireUser("/pages/paid-courses");
  if (!(await allow("checkout", user.id, LIMITS.checkout.limit, LIMITS.checkout.window))) throw new Error(TOO_MANY);
  const country = s("country")?.toUpperCase() ?? null;
  const company = s("company")?.slice(0, 200) ?? null;
  const taxId = s("tax_id")?.replace(/\s+/g, "").slice(0, 40) ?? null;
  const quote = await buildQuote({ courseSlug: s("course"), bundleSlug: s("bundle"), couponCode: s("coupon"), country, businessTaxId: taxId ?? undefined });
  if (!quote) throw new Error("Item not found");

  const db = createAdminClient();

  // Already has (unexpired) access to everything in this item: never charge again
  const { data: owned } = await db.from("enrollments").select("course_id, expires_at")
    .eq("user_id", user.id).is("revoked_at", null).in("course_id", quote.item.courseIds);
  const active = (owned ?? []).filter((e) => !e.expires_at || new Date(e.expires_at).getTime() > Date.now());
  if (quote.item.courseIds.length && active.length >= quote.item.courseIds.length) {
    redirect(quote.item.kind === "course" ? `/learn/${quote.item.slug}` : "/dashboard");
  }

  // Pressed Pay again for the same thing (refresh, back button, second tab)? Reuse that payment, don't start a new one.
  const reused = await reusePendingOrder(user.id, quote, s("gateway"));
  if (reused) redirect(reused);

  const jar = await cookies();
  const attr = await resolveAttribution({
    refCode: jar.get("fc_ref")?.value, campaign: jar.get("fc_campaign")?.value, buyerId: user.id, couponId: quote.coupon?.id,
  });

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
    tax_name: quote.reverseCharge ? null : quote.taxName, billing_company: company, billing_tax_id: taxId, reverse_charge: quote.reverseCharge,
    affiliate_id: attr?.affiliateId ?? null, attribution: attr?.attribution ?? null, affiliate_campaign: attr?.campaign ?? null,
    gateway: gatewayId ?? "free",
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
    after(async () => { await sendReceipt(order.id); await sendEnrolledForOrder(order.id); });
    redirect(`/checkout/success?order=${order.id}`);
  }

  const conn = await connect(gatewayId!);
  if (!conn) throw new Error("No payment method available");
  const session = await conn.gateway.createCheckout({
    orderId: order.id, orderNumber: order.number, currency: quote.currency, totalMinor: quote.totalMinor,
    lines: [{ title: quote.item.title, amountMinor: quote.totalMinor, quantity: 1 }],
    customer: { id: user.id, email: user.email ?? "", name: user.fullName, country },
    successUrl: `${env.siteUrl}/checkout/success?order=${order.id}`,
    cancelUrl: `${env.siteUrl}/checkout?${quote.item.kind}=${quote.item.slug}`,
    webhookUrl: `${env.siteUrl}/api/webhooks/payments/${conn.gateway.id}`,
  }, conn.cfg);
  await db.from("orders").update({ gateway_session_id: session.sessionId, gateway_redirect_url: session.redirectUrl }).eq("id", order.id);
  // paying outside the site (bank transfer, payment link): email the amount, reference and a way back
  if (conn.gateway.custom) after(() => sendPaymentPending(order.id, conn.gateway.custom!.label || conn.gateway.name, conn.gateway.custom!.instructions));
  redirect(session.redirectUrl);
}

/**
 * A pending order from the last 20 minutes for the same item, amount and provider: first ask the provider
 * whether it was actually paid (then show success), otherwise send the buyer back to the same payment page.
 */
async function reusePendingOrder(userId: string, quote: NonNullable<Awaited<ReturnType<typeof buildQuote>>>, gatewayChoice?: string): Promise<string | null> {
  if (quote.totalMinor <= 0) return null;
  const db = createAdminClient();
  const since = new Date(Date.now() - 20 * 60_000).toISOString();
  const { data: pending } = await db.from("orders")
    .select("id, gateway, gateway_session_id, gateway_redirect_url, total_minor, currency, order_items(course_id, bundle_id)")
    .eq("user_id", userId).eq("status", "pending").gte("created_at", since).order("created_at", { ascending: false }).limit(5);
  const itemKey = quote.item.kind === "course" ? "course_id" : "bundle_id";
  const match = (pending ?? []).find((o) =>
    o.total_minor === quote.totalMinor && o.currency === quote.currency && o.gateway_redirect_url &&
    (!gatewayChoice || gatewayChoice === o.gateway) &&
    (o.order_items ?? []).some((i) => i[itemKey] === quote.item.id));
  if (!match) return null;
  const conn = await connect(match.gateway);
  if (!conn) return null;
  if (conn.gateway.verify && match.gateway_session_id) {
    try {
      const events = await conn.gateway.verify({ orderId: match.id, sessionId: match.gateway_session_id }, conn.cfg);
      if (events.length && (await applyGatewayEvents(match.gateway, events))) return `/checkout/success?order=${match.id}`;
    } catch { /* provider unreachable: fall back to the stored payment page */ }
  }
  // payment-link providers show our own pay page; others go back to the provider's page
  if (match.gateway.startsWith("custom-")) return `/checkout/pay/${match.id}`;
  return match.gateway === "manual" ? `/checkout/success?order=${match.id}` : match.gateway_redirect_url;
}

/** Test gateway only: simulate a successful payment. */
export async function simulatePayment(orderId: string) {
  const user = await requireUser();
  if (process.env.ALLOW_TEST_PAYMENTS !== "true") throw new Error("Test payments are disabled");
  const db = createAdminClient();
  const { data: order } = await db.from("orders").select("user_id, gateway").eq("id", orderId).single();
  if (!order || order.user_id !== user.id || order.gateway !== "manual") throw new Error("Not allowed");
  await db.rpc("fulfill_order", { p_order: orderId, p_gateway_ref: `manual_${orderId}` });
  after(() => sendReceipt(orderId));
  redirect(`/checkout/success?order=${orderId}`);
}
