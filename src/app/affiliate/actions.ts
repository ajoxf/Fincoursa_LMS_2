"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type ApplyState = { error?: string } | null;

const schema = z.object({
  code: z.string().trim().regex(/^[A-Za-z0-9_-]{3,30}$/, "Use 3–30 letters, numbers, - or _"),
  website: z.string().trim().max(300).optional(),
  notes: z.string().trim().max(1000).optional(),
});

export async function applyAsAffiliate(_: ApplyState, form: FormData): Promise<ApplyState> {
  const user = await requireUser("/affiliate");
  const parsed = schema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { error } = await (await createClient()).from("affiliates").insert({
    user_id: user.id, code: parsed.data.code.toUpperCase(), status: "pending", website: parsed.data.website, notes: parsed.data.notes,
  });
  if (error) return { error: error.code === "23505" ? "That code is taken — try another." : "Could not submit your application." };
  revalidatePath("/affiliate");
  return null;
}
