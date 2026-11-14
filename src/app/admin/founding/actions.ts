"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { setSetting } from "@/lib/site-settings";
import { FOUNDING_DEFAULTS, type FoundingSettings } from "@/lib/founding";
import { minorUnitsFactor } from "@/lib/money";

const back = (k: "ok" | "err", msg: string): never => redirect(`/admin/founding?${k}=${encodeURIComponent(msg)}`);
const num = (v: FormDataEntryValue | null) => Number(String(v ?? "").replace(/[%,\s]/g, ""));
/** "2026-12-16" → end of that day (UTC); empty → null */
const endOfDay = (v: FormDataEntryValue | null): string | null | false => {
  const s = String(v ?? "").trim();
  if (!s) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T23:59:59Z`).toISOString() : false;
};

async function audit(actor: string, action: string, entityId: string, data?: object) {
  await createAdminClient().from("audit_log").insert({ actor_id: actor, action, entity: "founding_member", entity_id: entityId, data });
}

export async function saveFoundingSettings(form: FormData) {
  const admin = await requireRole(["admin", "finance"]);
  const mode = form.get("mode") === "fixed" ? "fixed" : "percent";
  const percent = num(form.get("percent"));
  const fixed: Record<string, number> = {};
  for (const [k, v] of form.entries()) {
    const m = /^fixed_([A-Z]{3})$/.exec(k);
    if (!m || String(v).trim() === "") continue;
    const n = num(v);
    if (!(n >= 0)) back("err", `Enter a valid ${m[1]} amount.`);
    if (n > 0) fixed[m[1]] = Math.round(n * minorUnitsFactor(m[1]));
  }
  if (mode === "percent" && !(percent > 0 && percent <= 100)) back("err", "Enter a discount percentage between 0 and 100.");
  if (mode === "fixed" && !Object.keys(fixed).length) back("err", "Enter a fixed discount for at least one currency.");
  const join = endOfDay(form.get("join_ends_at"));
  const benefit = endOfDay(form.get("benefit_ends_at"));
  if (join === false || benefit === false) back("err", "Use valid dates.");
  const capRaw = String(form.get("cap") ?? "").trim();
  const cap = capRaw === "" ? null : num(capRaw);
  if (cap !== null && !(Number.isInteger(cap) && cap >= 1)) back("err", "The member limit must be a whole number, or empty for no limit.");
  const qualifying = form.getAll("qualifying").map(String).filter((s) => /^[0-9a-f-]{36}$/.test(s));
  const enabled = form.get("enabled") === "on";
  if (enabled && !qualifying.length) back("err", "Choose at least one course that makes buyers founding members.");

  const value: FoundingSettings = {
    ...FOUNDING_DEFAULTS, enabled, qualifying_course_ids: qualifying,
    join_ends_at: join || null, cap, mode, percent: Math.round(percent * 100) / 100 || FOUNDING_DEFAULTS.percent, fixed,
    benefit_ends_at: benefit || null, allow_with_coupon: form.get("allow_with_coupon") === "on",
  };
  await setSetting("founding", value, admin.id);
  await audit(admin.id, "founding.settings", "founding", value);
  revalidatePath("/", "layout");
  back("ok", "Founding member settings saved.");
}

export async function addFoundingMember(form: FormData) {
  const admin = await requireRole(["admin", "finance"]);
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const note = String(form.get("note") ?? "").trim().slice(0, 200) || null;
  if (!email) back("err", "Enter the customer's email.");
  const db = createAdminClient();
  const { data: p } = await db.from("profiles").select("id").ilike("email", email).maybeSingle();
  if (!p) back("err", `No customer with the email ${email}.`);
  const { data: existing } = await db.from("founding_members").select("revoked_at").eq("user_id", p!.id).maybeSingle();
  const { error } = existing
    ? await db.from("founding_members").update({ revoked_at: null, note: note ?? undefined }).eq("user_id", p!.id)
    : await db.from("founding_members").insert({ user_id: p!.id, source: "manual", note, created_by: admin.id });
  if (error) back("err", error.message);
  await audit(admin.id, "founding.added", p!.id, { email });
  revalidatePath("/admin/founding");
  back("ok", `${email} is a founding member.`);
}

export async function setFoundingActive(userId: string, active: boolean) {
  const admin = await requireRole(["admin", "finance"]);
  await createAdminClient().from("founding_members").update({ revoked_at: active ? null : new Date().toISOString() }).eq("user_id", userId);
  await audit(admin.id, active ? "founding.restored" : "founding.removed", userId);
  revalidatePath("/admin/founding");
}
