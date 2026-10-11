"use server";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/** Create or update one country's tax rule. Rate is entered as a percentage (e.g. 5 or 20). */
export async function saveTaxRate(form: FormData) {
  await requireRole(["admin", "finance"]);
  const country = String(form.get("country_code") ?? "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(country)) throw new Error("Use a 2-letter country code, e.g. GB");
  const pct = Number(String(form.get("rate") ?? "").replace("%", ""));
  if (!Number.isFinite(pct) || pct < 0 || pct > 50) throw new Error("Rate must be between 0 and 50%");
  const name = String(form.get("name") ?? "").trim() || `${country} tax`;
  const label = String(form.get("label") ?? "").trim().toUpperCase() || "VAT";
  const { error } = await createAdminClient().from("tax_rates").upsert({
    country_code: country, name, label, rate: Math.round(pct * 1000) / 100000,
    prices_include_tax: form.get("prices_include_tax") === "on",
    reverse_charge: form.get("reverse_charge") === "on",
    is_active: form.get("is_active") === "on",
  });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/taxes");
}

export async function setTaxActive(country: string, active: boolean) {
  await requireRole(["admin", "finance"]);
  await createAdminClient().from("tax_rates").update({ is_active: active }).eq("country_code", country);
  revalidatePath("/admin/taxes");
}
