"use server";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { gatewayConfig, getGateway, hasKeys } from "@/lib/payments/registry";
import { decryptSecrets, encryptSecrets, hint } from "@/lib/payments/secrets";

export type KeysState = { ok: boolean; message: string } | null;

async function audit(actor: string, action: string, gateway: string, data?: object) {
  await createAdminClient().from("audit_log").insert({ actor_id: actor, action, entity: "gateway_settings", entity_id: null, data: { gateway, ...data } });
}

async function runTest(id: string): Promise<KeysState> {
  const g = getGateway(id)!;
  const cfg = await gatewayConfig(id);
  if (!hasKeys(g, cfg)) return { ok: false, message: "Saved. Some required keys are still missing." };
  if (!g.testConnection) return { ok: true, message: "Saved." };
  try {
    return { ok: true, message: `Saved. ${await g.testConnection(cfg)}` };
  } catch (e) {
    return { ok: false, message: `Saved, but the provider rejected the keys: ${(e as Error).message}` };
  }
}

/**
 * Save a provider's keys. Secret boxes left blank keep the saved value; secrets are encrypted
 * before they reach the database and are never sent back to the browser. Admins only.
 */
export async function saveGatewayKeys(id: string, _prev: KeysState, form: FormData): Promise<KeysState> {
  const admin = await requireRole(["admin"]);
  const g = getGateway(id);
  if (!g || !g.fields.length) return { ok: false, message: "Unknown provider" };
  const db = createAdminClient();
  const { data: row, error: readErr } = await db.from("gateway_settings").select("public_values, secrets_enc, secret_hints").eq("gateway", id).maybeSingle();
  if (readErr) return { ok: false, message: "The payment keys table is missing. Run the latest database update first." };

  const secrets = { ...(decryptSecrets(row?.secrets_enc) ?? {}) };
  const publicValues: Record<string, string> = {};
  const changed: string[] = [];
  for (const f of g.fields) {
    const v = String(form.get(f.key) ?? "").trim();
    if (v.length > 4000) return { ok: false, message: `${f.label} is too long` };
    if (f.options && v && !f.options.includes(v)) return { ok: false, message: `${f.label} must be one of ${f.options.join(", ")}` };
    if (f.secret) {
      if (v) { secrets[f.key] = v; changed.push(f.key); }
    } else if (v) {
      publicValues[f.key] = v;
      if ((row?.public_values as Record<string, string> | null)?.[f.key] !== v) changed.push(f.key);
    }
  }
  const hints = Object.fromEntries(Object.entries(secrets).map(([k, v]) => [k, hint(v)]));

  const { error } = await db.from("gateway_settings").upsert({
    gateway: id, public_values: publicValues, secrets_enc: Object.keys(secrets).length ? encryptSecrets(secrets) : null,
    secret_hints: hints, updated_at: new Date().toISOString(), updated_by: admin.id,
  }, { onConflict: "gateway" });
  if (error) return { ok: false, message: error.message };
  await audit(admin.id, "gateway_keys.saved", id, { fields: changed }); // field names only, never values
  revalidatePath("/admin/payments");
  return runTest(id);
}

export async function testGatewayKeys(id: string): Promise<KeysState> {
  await requireRole(["admin", "finance"]);
  if (!getGateway(id)) return { ok: false, message: "Unknown provider" };
  const r = await runTest(id);
  return r && { ...r, message: r.message.replace(/^Saved[.,]\s*/, "").replace(/^but /, "") || "Keys present." };
}

export async function setGatewayEnabled(id: string, enabled: boolean) {
  const admin = await requireRole(["admin"]);
  if (!getGateway(id)) throw new Error("Unknown provider");
  await createAdminClient().from("gateway_settings").upsert({ gateway: id, enabled, updated_at: new Date().toISOString(), updated_by: admin.id }, { onConflict: "gateway" });
  await audit(admin.id, enabled ? "gateway.enabled" : "gateway.paused", id);
  revalidatePath("/admin/payments");
}

/** Delete the keys saved here (keys in Vercel env vars, if any, still apply). */
export async function removeGatewayKeys(id: string) {
  const admin = await requireRole(["admin"]);
  await createAdminClient().from("gateway_settings").delete().eq("gateway", id);
  await audit(admin.id, "gateway_keys.removed", id);
  revalidatePath("/admin/payments");
}
