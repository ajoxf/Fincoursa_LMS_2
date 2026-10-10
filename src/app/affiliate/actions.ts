"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { allow, LIMITS, TOO_MANY } from "@/lib/rate-limit";

export type ApplyState = { error?: string; ok?: boolean } | null;

const schema = z.object({
  code: z.string().trim().regex(/^[A-Za-z0-9_-]{3,30}$/, "Use 3–30 letters, numbers, - or _"),
  website: z.string().trim().max(300).optional(),
  notes: z.string().trim().max(1000).optional(),
  parent_code: z.string().trim().max(40).optional(),
});

export async function applyAsAffiliate(_: ApplyState, form: FormData): Promise<ApplyState> {
  const user = await requireUser("/affiliate");
  if (!(await allow("aff-apply", user.id, LIMITS.affiliateApply.limit, LIMITS.affiliateApply.window))) return { error: TOO_MANY };
  const parsed = schema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  let parentId: string | null = null;
  if (parsed.data.parent_code) {
    const { data: parent } = await createAdminClient().from("affiliates").select("id, status, user_id").eq("code", parsed.data.parent_code).maybeSingle();
    if (parent?.status === "approved" && parent.user_id !== user.id) parentId = parent.id;
  }
  const { error } = await createAdminClient().from("affiliates").insert({
    user_id: user.id, code: parsed.data.code.toUpperCase(), status: "pending",
    website: parsed.data.website, notes: parsed.data.notes, parent_affiliate_id: parentId,
  });
  if (error) return { error: error.code === "23505" ? "That code is taken — try another." : "Could not submit your application." };
  revalidatePath("/affiliate");
  return null;
}

const payout = z.object({
  method: z.enum(["bank_transfer", "paypal", "wise"]),
  account_name: z.string().trim().max(120).optional(),
  bank_name: z.string().trim().max(120).optional(),
  iban: z.string().trim().max(40).optional(),
  swift: z.string().trim().max(15).optional(),
  email: z.string().trim().max(200).optional(),
  currency: z.string().trim().max(3).optional(),
});

/** The affiliate updates only their own payout details. */
export async function savePayoutDetails(_: ApplyState, form: FormData): Promise<ApplyState> {
  const user = await requireUser("/affiliate?tab=payouts");
  const parsed = payout.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "Please check the payout details." };
  const d = parsed.data;
  const { data: mine } = await (await createClient()).from("affiliates").select("id, payout_details").eq("user_id", user.id).maybeSingle();
  if (!mine) return { error: "No affiliate account." };
  if (!d.iban) d.iban = (mine.payout_details as { iban?: string } | null)?.iban; // blank field keeps the saved IBAN
  if (d.method === "bank_transfer" && (!d.account_name || !d.iban)) return { error: "Account name and IBAN are required for bank transfers." };
  if (d.method !== "bank_transfer" && !d.email) return { error: "Enter the email of your PayPal / Wise account." };
  const details = { ...d, iban: d.iban?.replace(/\s+/g, "").toUpperCase(), updated_at: new Date().toISOString() };
  const { error } = await createAdminClient().from("affiliates").update({ payout_details: details }).eq("id", mine.id);
  if (error) return { error: "Could not save." };
  revalidatePath("/affiliate");
  return { ok: true };
}
