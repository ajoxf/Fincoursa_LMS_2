"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { setSetting } from "@/lib/site-settings";
import { CASHBACK_DEFAULTS, type CashbackSettings } from "@/lib/cashback";
import { minorUnitsFactor } from "@/lib/money";

const back = (k: "ok" | "err", msg: string): never => redirect(`/admin/credit?${k}=${encodeURIComponent(msg)}`);
const num = (v: FormDataEntryValue | null) => Number(String(v ?? "").replace(/[%,\s]/g, ""));

/** Fixed amounts from inputs named fixed_USD, fixed_INR, ... (major units) → minor units; empty = none. */
function fixedAmounts(form: FormData): Record<string, number> | string {
  const out: Record<string, number> = {};
  for (const [k, v] of form.entries()) {
    const m = /^fixed_([A-Z]{3})$/.exec(k);
    if (!m || String(v).trim() === "") continue;
    const n = num(v);
    if (!(n >= 0)) return `Enter a valid ${m[1]} amount.`;
    if (n > 0) out[m[1]] = Math.round(n * minorUnitsFactor(m[1]));
  }
  return out;
}

async function audit(actor: string, action: string, entity: string, entityId: string, data?: object) {
  await createAdminClient().from("audit_log").insert({ actor_id: actor, action, entity, entity_id: entityId, data });
}

/** The cashback rules used at checkout. Orders keep the cashback they were sold with. */
export async function saveCashbackSettings(form: FormData) {
  const admin = await requireRole(["admin", "finance"]);
  const mode = form.get("mode") === "fixed" ? "fixed" : "percent";
  const percent = num(form.get("percent"));
  const fixed = fixedAmounts(form);
  if (typeof fixed === "string") back("err", fixed as string);
  if (mode === "fixed" && !Object.keys(fixed).length) back("err", "Enter a fixed cashback amount for at least one currency.");
  const maxRedeem = num(form.get("max_redeem_pct"));
  const validity = String(form.get("validity_days") ?? "").trim();
  const days = validity === "" ? null : num(validity);
  const endsAt = String(form.get("ends_at") ?? "").trim();
  const bonusRaw = String(form.get("review_bonus_pct") ?? "").trim();
  const bonus = bonusRaw === "" ? null : num(bonusRaw);
  if (bonus !== null && !(bonus > 0 && bonus <= 100)) back("err", "Cashback with a review must be between 1 and 100%, or empty for none.");
  if (endsAt && !/^\d{4}-\d{2}-\d{2}$/.test(endsAt)) back("err", "Use a valid end date, or leave it empty.");
  if (!(percent >= 0 && percent <= 100)) back("err", "Cashback must be between 0 and 100%.");
  if (!(maxRedeem >= 1 && maxRedeem <= 100)) back("err", "Credit per order must be between 1 and 100%.");
  if (days !== null && !(Number.isInteger(days) && days >= 1 && days <= 3650)) back("err", "Validity must be 1–3650 days, or empty for no expiry.");

  const value: CashbackSettings = {
    ...CASHBACK_DEFAULTS,
    enabled: form.get("enabled") === "on",
    mode,
    percent: Math.round(percent * 100) / 100,
    fixed: fixed as Record<string, number>,
    validity_days: days,
    max_redeem_pct: Math.round(maxRedeem),
    allow_with_coupon: form.get("allow_with_coupon") === "on",
    earn_on_credit: form.get("earn_on_credit") === "on",
    ends_at: endsAt || null,
    review_bonus_pct: bonus,
  };
  await setSetting("cashback", value, admin.id);
  await audit(admin.id, "cashback.settings", "site_settings", "cashback", value);
  revalidatePath("/", "layout");
  back("ok", "Cashback settings saved.");
}

/** Per course / programme: the default, none, its own % or its own fixed amount per currency. */
export async function saveItemCashback(form: FormData) {
  const admin = await requireRole(["admin", "finance"]);
  const kind = String(form.get("kind")) === "bundle" ? "bundles" : "courses";
  const id = String(form.get("id") ?? "");
  const m = String(form.get("mode") ?? "");
  const mode = m === "none" || m === "percent" || m === "fixed" ? m : null;
  const row: { cashback_mode: string | null; cashback_percent: number | null; cashback_fixed: Record<string, number> | null } =
    { cashback_mode: mode, cashback_percent: null, cashback_fixed: null };
  if (mode === "percent") {
    const pct = num(form.get("percent"));
    if (!(pct > 0 && pct <= 100)) back("err", "Enter a cashback percentage between 0 and 100.");
    row.cashback_percent = Math.round(pct * 100) / 100;
  } else if (mode === "fixed") {
    const fixed = fixedAmounts(form);
    if (typeof fixed === "string") back("err", fixed as string);
    if (!Object.keys(fixed).length) back("err", "Enter a fixed cashback amount for at least one currency.");
    row.cashback_fixed = fixed as Record<string, number>;
  }
  const { error } = await createAdminClient().from(kind).update(row).eq("id", id);
  if (error) back("err", error.message);
  await audit(admin.id, "cashback.item", kind, id, row);
  revalidatePath("/", "layout");
  back("ok", "Saved.");
}

/** Give or remove credit for one customer (e.g. a goodwill gesture or a correction). */
export async function adjustCustomerCredit(form: FormData) {
  const admin = await requireRole(["admin", "finance"]);
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const currency = String(form.get("currency") ?? "").trim().toUpperCase();
  const amount = num(form.get("amount"));
  const note = String(form.get("note") ?? "").trim().slice(0, 200) || null;
  const expires = String(form.get("expires_at") ?? "").trim();
  if (!email) back("err", "Enter the customer's email.");
  if (!/^[A-Z]{3}$/.test(currency)) back("err", "Choose a currency.");
  if (!Number.isFinite(amount) || amount === 0) back("err", "Enter an amount (negative to remove credit).");
  if (expires && !/^\d{4}-\d{2}-\d{2}$/.test(expires)) back("err", "Use a valid expiry date.");

  const db = createAdminClient();
  const { data: p } = await db.from("profiles").select("id").ilike("email", email).maybeSingle();
  if (!p) back("err", `No customer with the email ${email}.`);
  const { error } = await db.rpc("adjust_credit", {
    p_user: p!.id, p_currency: currency, p_amount: Math.round(amount * minorUnitsFactor(currency)),
    p_note: note ?? (amount > 0 ? "Credit from FinCoursa" : "Credit adjustment"),
    p_expires_at: expires ? new Date(`${expires}T23:59:59Z`).toISOString() : null, p_actor: admin.id,
  });
  if (error) back("err", error.message);
  revalidatePath("/admin/credit");
  back("ok", `${amount > 0 ? "Added" : "Removed"} ${Math.abs(amount)} ${currency} ${amount > 0 ? "for" : "from"} ${email}.`);
}

/**
 * Buyer gave feedback and a review: top their cashback on this order up to the review rate
 * (Admin → Credit, e.g. 100% of the amount paid before tax). Once per order.
 */
export async function grantReviewBonus(orderId: string, back2: string) {
  const admin = await requireRole(["admin", "finance"]);
  const db = createAdminClient();
  const s = { ...CASHBACK_DEFAULTS, ...((await db.from("site_settings").select("value").eq("key", "cashback").maybeSingle()).data?.value ?? {}) } as CashbackSettings;
  const go = (k: "ok" | "err", m: string): never => redirect(`${back2}${back2.includes("?") ? "&" : "?"}${k}=${encodeURIComponent(m)}`);
  if (!s.review_bonus_pct) go("err", "Set the cashback for a review in Admin → Credit first.");
  const { data: o } = await db.from("orders").select("id, number, user_id, status, currency, total_minor, tax_minor, refunded_minor").eq("id", orderId).maybeSingle();
  if (!o || o.status !== "paid" || Number(o.refunded_minor ?? 0) > 0) go("err", "Only paid, unrefunded orders can get the review cashback.");
  const note = `Feedback and review cashback, order #${o!.number}`;
  const { data: dup } = await db.from("credit_grants").select("id").eq("user_id", o!.user_id).eq("note", note).limit(1);
  if (dup?.length) go("err", `Order #${o!.number} already has the review cashback.`);
  const { data: earned } = await db.from("credit_grants").select("amount_minor").eq("order_id", orderId).eq("source", "cashback");
  const have = (earned ?? []).reduce((a, g) => a + Number(g.amount_minor), 0);
  const target = Math.round((Number(o!.total_minor) - Number(o!.tax_minor ?? 0)) * s.review_bonus_pct! / 100);
  const top = target - have;
  if (top <= 0) go("err", `Order #${o!.number} already has ${s.review_bonus_pct}% or more back as credit.`);
  const expires = s.validity_days ? new Date(Date.now() + s.validity_days * 864e5).toISOString() : null;
  const { error } = await db.rpc("adjust_credit", { p_user: o!.user_id, p_currency: o!.currency, p_amount: top, p_note: note, p_expires_at: expires, p_actor: admin.id });
  if (error) go("err", error.message);
  await db.from("audit_log").insert({ actor_id: admin.id, action: "credit.review_bonus", entity: "order", entity_id: orderId, data: { amount_minor: top, currency: o!.currency } });
  revalidatePath(back2.split("?")[0]);
  go("ok", `Added ${(top / minorUnitsFactor(o!.currency)).toFixed(2)} ${o!.currency} credit for order #${o!.number} (now ${s.review_bonus_pct}% back).`);
}
