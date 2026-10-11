"use server";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveGateway } from "@/lib/payments/registry";

const code = (v: FormDataEntryValue | null, n: number) => {
  const s = String(v ?? "").trim().toUpperCase();
  return s && s !== "ANY" ? s.slice(0, n) : null;
};

/** Route buyers from a country/currency to a gateway. Most specific match wins, then lowest priority. */
export async function addRoute(form: FormData) {
  await requireRole(["admin", "finance"]);
  const gateway = String(form.get("gateway") ?? "");
  if (!(await resolveGateway(gateway))) throw new Error("Unknown gateway");
  const country = code(form.get("country_code"), 2);
  if (country && !/^[A-Z]{2}$/.test(country)) throw new Error("Use a 2-letter country code or leave blank for any country");
  const currency = code(form.get("currency"), 3);
  const { error } = await createAdminClient().from("payment_routes").insert({
    country_code: country, currency, gateway, priority: Number(form.get("priority") ?? 100) || 100, is_active: true,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/payments");
}

export async function setRouteActive(id: string, active: boolean) {
  await requireRole(["admin", "finance"]);
  await createAdminClient().from("payment_routes").update({ is_active: active }).eq("id", id);
  revalidatePath("/admin/payments");
}

export async function deleteRoute(id: string) {
  await requireRole(["admin", "finance"]);
  await createAdminClient().from("payment_routes").delete().eq("id", id);
  revalidatePath("/admin/payments");
}
