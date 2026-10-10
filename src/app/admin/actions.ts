"use server";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getGateway } from "@/lib/payments/registry";
import { minorUnitsFactor } from "@/lib/money";
import { partnerCodesEnabled } from "@/lib/env";

async function audit(actor: string, action: string, entity: string, entityId: string, data?: object) {
  await createAdminClient().from("audit_log").insert({ actor_id: actor, action, entity, entity_id: entityId, data });
}

/** Refund: through the gateway when it supports it (its webhook then records it), otherwise record a manual refund. */
export async function refundOrder(orderId: string, form: FormData) {
  const admin = await requireRole(["admin", "finance"]);
  const reason = String(form.get("reason") ?? "").slice(0, 500);
  const db = createAdminClient();
  const { data: o } = await db.from("orders").select("gateway, gateway_session_id, currency").eq("id", orderId).single();
  if (!o) throw new Error("Order not found");
  const amount = Math.round(Number(form.get("amount")) * minorUnitsFactor(o.currency));
  if (!(amount > 0)) throw new Error("Enter an amount");
  const gw = o?.gateway ? getGateway(o.gateway) : undefined;
  if (gw?.refund && o.gateway_session_id) {
    const { refundId } = await gw.refund({ orderId, sessionId: o.gateway_session_id, amountMinor: amount, currency: o.currency });
    await db.rpc("apply_refund", { p_order: orderId, p_amount: amount, p_reason: reason, p_gateway_refund_id: refundId, p_actor: admin.id });
  } else {
    await db.rpc("apply_refund", { p_order: orderId, p_amount: amount, p_reason: reason || "manual refund", p_gateway_refund_id: null, p_actor: admin.id });
  }
  revalidatePath("/admin/orders");
}

export async function setAffiliateStatus(affiliateId: string, status: "approved" | "suspended", form?: FormData) {
  const admin = await requireRole(["admin"]);
  const db = createAdminClient();
  const num = (k: string) => { const v = form?.get(k); const n = Number(v); return v === null || v === undefined || v === "" || isNaN(n) ? undefined : Math.min(100, Math.max(0, n)); };
  const patch: Record<string, unknown> = { status, approved_at: status === "approved" ? new Date().toISOString() : null };
  if (num("commission_pct") !== undefined) patch.commission_pct = num("commission_pct");
  if (form) {
    if (num("override_pct") !== undefined) patch.override_pct = num("override_pct");
    if (num("cookie_days") !== undefined) patch.cookie_days = Math.max(1, Math.round(Number(form.get("cookie_days"))));
    const parentCode = String(form.get("parent_code") ?? "").trim();
    if (parentCode) {
      const { data: parent } = await db.from("affiliates").select("id").eq("code", parentCode).neq("id", affiliateId).maybeSingle();
      if (parent) patch.parent_affiliate_id = parent.id;
    } else patch.parent_affiliate_id = null;
  }
  const { data: a } = await db.from("affiliates").update(patch).eq("id", affiliateId).select("user_id, approved_at").single();
  if (a && status === "approved") await db.from("user_roles").upsert({ user_id: a.user_id, role: "affiliate" });
  await audit(admin.id, `affiliate.${status}`, "affiliate", affiliateId, patch);
  revalidatePath("/admin/affiliates");
}

/** A discount code that credits sales to the affiliate/IB even without their link. */
export async function createAffiliateCoupon(affiliateId: string, form: FormData) {
  await requireRole(["admin", "finance"]);
  if (!partnerCodesEnabled) throw new Error("Partner codes are switched off");
  const code = String(form.get("code") ?? "").trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "");
  const percent = Number(form.get("percent_off"));
  if (code.length < 3 || !(percent > 0 && percent <= 100)) throw new Error("Enter a code and a discount between 1 and 100%");
  const ends = String(form.get("ends_at") ?? "");
  const { error } = await createAdminClient().from("coupons").insert({
    code, percent_off: percent, affiliate_id: affiliateId, is_active: true,
    max_redemptions: Number(form.get("max_redemptions")) || null, ends_at: ends ? new Date(ends).toISOString() : null,
  });
  if (error) throw new Error(error.code === "23505" ? "That code already exists" : error.message);
  revalidatePath("/admin/affiliates");
}

/** Group every approved (payable) earning per payee into a draft payout. */
export async function createPayouts() {
  const admin = await requireRole(["admin", "finance"]);
  const db = createAdminClient();
  const [{ data: ie }, { data: ac }] = await Promise.all([
    db.from("instructor_earnings").select("id, instructor_id, currency, amount_minor").eq("status", "approved").is("payout_id", null),
    db.from("affiliate_commissions").select("id, affiliate_id, currency, amount_minor").eq("status", "approved").is("payout_id", null),
  ]);
  type Group = { type: "instructor" | "affiliate"; payee: string; currency: string; total: number; ids: string[] };
  const groups = new Map<string, Group>();
  for (const r of ie ?? []) {
    const k = `i:${r.instructor_id}:${r.currency}`;
    const g: Group = groups.get(k) ?? { type: "instructor", payee: r.instructor_id, currency: r.currency, total: 0, ids: [] };
    g.total += Number(r.amount_minor); g.ids.push(r.id); groups.set(k, g);
  }
  for (const r of ac ?? []) {
    const k = `a:${r.affiliate_id}:${r.currency}`;
    const g: Group = groups.get(k) ?? { type: "affiliate", payee: r.affiliate_id, currency: r.currency, total: 0, ids: [] };
    g.total += Number(r.amount_minor); g.ids.push(r.id); groups.set(k, g);
  }
  for (const g of groups.values()) {
    if (g.total <= 0) continue;
    const { data: p } = await db.from("payouts").insert({
      payee_type: g.type, instructor_id: g.type === "instructor" ? g.payee : null, affiliate_id: g.type === "affiliate" ? g.payee : null,
      currency: g.currency, amount_minor: g.total, status: "draft", created_by: admin.id,
    }).select("id").single();
    if (!p) continue;
    const table = g.type === "instructor" ? "instructor_earnings" : "affiliate_commissions";
    await db.from(table).update({ payout_id: p.id }).in("id", g.ids);
  }
  revalidatePath("/admin/payouts");
}

export async function markPayoutPaid(payoutId: string, form: FormData) {
  const admin = await requireRole(["admin", "finance"]);
  const db = createAdminClient();
  const { data: p } = await db.from("payouts")
    .update({ status: "paid", paid_at: new Date().toISOString(), method: String(form.get("method") ?? "bank transfer"), reference: String(form.get("reference") ?? "") })
    .eq("id", payoutId).eq("status", "draft").select("payee_type").single();
  if (p) {
    const table = p.payee_type === "instructor" ? "instructor_earnings" : "affiliate_commissions";
    await db.from(table).update({ status: "paid" }).eq("payout_id", payoutId);
    await audit(admin.id, "payout.paid", "payout", payoutId);
  }
  revalidatePath("/admin/payouts");
}

export async function cancelPayout(payoutId: string) {
  await requireRole(["admin", "finance"]);
  const db = createAdminClient();
  await db.from("instructor_earnings").update({ payout_id: null }).eq("payout_id", payoutId);
  await db.from("affiliate_commissions").update({ payout_id: null }).eq("payout_id", payoutId);
  await db.from("payouts").update({ status: "cancelled" }).eq("id", payoutId).eq("status", "draft");
  revalidatePath("/admin/payouts");
}
