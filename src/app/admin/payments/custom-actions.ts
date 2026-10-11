"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getGateway } from "@/lib/payments/registry";

export type CustomState = { ok: boolean; message: string } | null;

const schema = z.object({
  name: z.string().trim().min(1, "Enter the provider's name").max(60),
  label: z.string().trim().max(80).optional(),
  instructions: z.string().trim().max(2000).optional(),
  pay_url: z.string().trim().max(1000).optional()
    .refine((v) => !v || /^https:\/\/[^\s]+$/.test(v), "The payment link must start with https://"),
  currencies: z.string().trim().max(200).optional(),
});

function parse(form: FormData) {
  const r = schema.safeParse(Object.fromEntries(form));
  if (!r.success) return { error: r.error.issues[0].message } as const;
  const d = r.data;
  const currencies = (d.currencies ?? "").split(/[\s,]+/).map((c) => c.trim().toUpperCase()).filter(Boolean);
  if (currencies.some((c) => !/^[A-Z]{3}$/.test(c))) return { error: "Currencies must be 3-letter codes, e.g. AED, USD" } as const;
  if (!d.pay_url && !d.instructions) return { error: "Add a payment link, instructions, or both, so buyers know how to pay" } as const;
  return {
    row: {
      name: d.name, label: d.label || `Pay with ${d.name}`, instructions: d.instructions || null,
      pay_url: d.pay_url || null, currencies: currencies.length ? [...new Set(currencies)] : null,
    },
  } as const;
}

async function audit(actor: string, action: string, id: string) {
  await createAdminClient().from("audit_log").insert({ actor_id: actor, action, entity: "custom_gateways", entity_id: id });
}

/** Add a payment provider without code: a payment link and/or instructions for the buyer. */
export async function createCustomProvider(_: CustomState, form: FormData): Promise<CustomState> {
  const admin = await requireRole(["admin"]);
  const p = parse(form);
  if ("error" in p) return { ok: false, message: p.error! };
  const base = `custom-${p.row.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || "provider"}`;
  const db = createAdminClient();
  let id = base;
  for (let n = 2; ; n++) {
    const { data } = await db.from("custom_gateways").select("id").eq("id", id).maybeSingle();
    if (!data && !getGateway(id)) break;
    id = `${base}-${n}`;
  }
  const { error } = await db.from("custom_gateways").insert({ id, ...p.row });
  if (error) return { ok: false, message: error.message.includes("custom_gateways") ? "Run the latest database update first." : error.message };
  await audit(admin.id, "custom_gateway.created", id);
  revalidatePath("/admin/payments");
  return { ok: true, message: `${p.row.name} added. Now add a rule for it under “Which provider each buyer sees”.` };
}

export async function updateCustomProvider(id: string, _: CustomState, form: FormData): Promise<CustomState> {
  const admin = await requireRole(["admin"]);
  const p = parse(form);
  if ("error" in p) return { ok: false, message: p.error! };
  const { error } = await createAdminClient().from("custom_gateways").update({ ...p.row, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return { ok: false, message: error.message };
  await audit(admin.id, "custom_gateway.updated", id);
  revalidatePath("/admin/payments");
  return { ok: true, message: "Saved." };
}

/** Remove the provider, its routes and its saved keys. Past orders keep their history. */
export async function deleteCustomProvider(id: string) {
  const admin = await requireRole(["admin"]);
  if (!id.startsWith("custom-")) throw new Error("Only providers added here can be deleted");
  const db = createAdminClient();
  await db.from("payment_routes").delete().eq("gateway", id);
  await db.from("gateway_settings").delete().eq("gateway", id);
  await db.from("custom_gateways").delete().eq("id", id);
  await audit(admin.id, "custom_gateway.deleted", id);
  revalidatePath("/admin/payments");
}
