"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { setSetting } from "@/lib/site-settings";
import { CASHBACK_DEFAULTS, type CashbackSettings } from "@/lib/cashback";
import { minorUnitsFactor } from "@/lib/money";

const back = (k: "ok" | "err", msg: string): never => redirect(`/admin/credit?${k}=${encodeURIComponent(msg)}`);
const num = (v: FormDataEntryValue | null) => Number(String(v ?? "").replace("%", "").trim());

async function audit(actor: string, action: string, entity: string, entityId: string, data?: object) {
  await createAdminClient().from("audit_log").insert({ actor_id: actor, action, entity, entity_id: entityId, data });
}

/** The cashback rules used at checkout. Orders keep the cashback they were sold with. */
export async function saveCashbackSettings(form: FormData) {
  const admin = await requireRole(["admin", "finance"]);
  const percent = num(form.get("percent"));
  const maxRedeem = num(form.get("max_redeem_pct"));
  const validity = String(form.get("validity_days") ?? "").trim();
  const days = validity === "" ? null : num(validity);
  if (!(percent >= 0 && percent <= 100)) back("err", "Cashback must be between 0 and 100%.");
  if (!(maxRedeem >= 1 && maxRedeem <= 100)) back("err", "Credit per order must be between 1 and 100%.");
  if (days !== null && !(Number.isInteger(days) && days >= 1 && days <= 3650)) back("err", "Validity must be 1–3650 days, or empty for no expiry.");

  const value: CashbackSettings = {
    ...CASHBACK_DEFAULTS,
    enabled: form.get("enabled") === "on",
    percent: Math.round(percent * 100) / 100,
    validity_days: days,
    max_redeem_pct: Math.round(maxRedeem),
    allow_with_coupon: form.get("allow_with_coupon") === "on",
    earn_on_credit: form.get("earn_on_credit") === "on",
  };
  await setSetting("cashback", value, admin.id);
  await audit(admin.id, "cashback.settings", "site_settings", "cashback", value);
  revalidatePath("/", "layout");
  back("ok", "Cashback settings saved.");
}

/** Per course / programme: empty = default rate, 0 = no cashback, otherwise its own %. */
export async function saveItemCashback(form: FormData) {
  const admin = await requireRole(["admin", "finance"]);
  const kind = String(form.get("kind")) === "bundle" ? "bundles" : "courses";
  const id = String(form.get("id") ?? "");
  const raw = String(form.get("cashback_percent") ?? "").trim();
  const pct = raw === "" ? null : num(raw);
  if (pct !== null && !(pct >= 0 && pct <= 100)) back("err", "Cashback must be between 0 and 100%, or empty for the default.");
  const { error } = await createAdminClient().from(kind).update({ cashback_percent: pct }).eq("id", id);
  if (error) back("err", error.message);
  await audit(admin.id, "cashback.item", kind, id, { cashback_percent: pct });
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
