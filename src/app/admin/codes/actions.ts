"use server";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { minorUnitsFactor } from "@/lib/money";

export type CodeFormState = { ok?: boolean; error?: string; code?: string } | null;

async function audit(actor: string, action: string, entityId: string, data?: object) {
  await createAdminClient().from("audit_log").insert({ actor_id: actor, action, entity: "coupon", entity_id: entityId, data });
}

const day = (v: FormDataEntryValue | null, endOfDay: boolean) => {
  const s = String(v ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return new Date(`${s}T${endOfDay ? "23:59:59" : "00:00:00"}Z`).toISOString();
};

/** A general discount code (not tied to an affiliate). Checkout already validates every field set here. */
export async function createCode(_: CodeFormState, form: FormData): Promise<CodeFormState> {
  const admin = await requireRole(["admin", "finance"]);
  const code = String(form.get("code") ?? "").trim().toUpperCase().replace(/\s+/g, "");
  if (!/^[A-Z0-9_-]{3,40}$/.test(code)) return { error: "Use 3–40 letters, numbers, - or _ for the code." };

  const kind = String(form.get("kind") ?? "percent");
  const value = Number(form.get("value"));
  const row: Record<string, unknown> = { code, is_active: true };
  if (kind === "percent") {
    if (!(value > 0 && value <= 100)) return { error: "Enter a percentage between 1 and 100." };
    row.percent_off = Math.round(value * 100) / 100;
  } else {
    const currency = String(form.get("currency") ?? "").trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) return { error: "Choose the currency for a fixed-amount discount." };
    if (!(value > 0)) return { error: "Enter the amount to take off." };
    row.amount_off_minor = Math.round(value * minorUnitsFactor(currency));
    row.currency = currency;
  }

  // "all", "course:<uuid>" or "bundle:<uuid>"
  const target = String(form.get("applies_to") ?? "all");
  const [t, id] = target.split(":");
  if (t === "course" && id) row.course_id = id;
  else if (t === "bundle" && id) row.bundle_id = id;

  const max = Number(form.get("max_redemptions"));
  if (max > 0) row.max_redemptions = Math.round(max);
  row.starts_at = day(form.get("starts_at"), false);
  row.ends_at = day(form.get("ends_at"), true);
  if (row.starts_at && row.ends_at && String(row.ends_at) < String(row.starts_at)) return { error: "The end date is before the start date." };

  const db = createAdminClient();
  const { data, error } = await db.from("coupons").insert(row).select("id").single();
  if (error) return { error: error.code === "23505" ? "That code already exists." : error.message };
  await audit(admin.id, "coupon.created", data.id, { code });
  revalidatePath("/admin/codes");
  return { ok: true, code };
}

export async function setCodeActive(id: string, active: boolean) {
  const admin = await requireRole(["admin", "finance"]);
  const { error } = await createAdminClient().from("coupons").update({ is_active: active }).eq("id", id);
  if (error) throw new Error(error.message);
  await audit(admin.id, active ? "coupon.activated" : "coupon.deactivated", id);
  revalidatePath("/admin/codes");
  revalidatePath("/admin/affiliates");
}

/** Only codes that were never used can be deleted, so order history keeps the code that was applied. */
export async function deleteCode(id: string) {
  const admin = await requireRole(["admin", "finance"]);
  const db = createAdminClient();
  const [{ data: c }, { count }] = await Promise.all([
    db.from("coupons").select("code, redeemed_count").eq("id", id).maybeSingle(),
    db.from("orders").select("id", { count: "exact", head: true }).eq("coupon_id", id),
  ]);
  if (!c) return;
  if ((c.redeemed_count ?? 0) > 0 || (count ?? 0) > 0) throw new Error("This code has been used, so it can only be switched off.");
  const { error } = await db.from("coupons").delete().eq("id", id);
  if (error) throw new Error(error.message);
  await audit(admin.id, "coupon.deleted", id, { code: c.code });
  revalidatePath("/admin/codes");
  revalidatePath("/admin/affiliates");
}
