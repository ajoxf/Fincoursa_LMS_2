"use server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/env";

const schema = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.email().max(320),
  organization: z.string().trim().max(200).optional(),
  program_type: z.enum(["general", "corporate", "university", "custom"]),
  message: z.string().trim().max(5000).optional(),
  website: z.string().max(0).optional(), // honeypot
});

export type ContactState = { ok: boolean; error?: string } | null;

export async function submitContact(_: ContactState, form: FormData): Promise<ContactState> {
  const parsed = schema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, error: "Please check your name and email." };
  if (!isSupabaseConfigured) return { ok: false, error: "The contact form isn't connected yet." };
  if (parsed.data.website) return { ok: true }; // bot filled the honeypot
  const { name, email, organization, program_type, message } = parsed.data;
  const row = { name, email, organization, program_type, message };
  const { error } = await createAdminClient().from("contact_requests").insert(row);
  if (error) return { ok: false, error: "Something went wrong. Please try again." };
  return { ok: true };
}
