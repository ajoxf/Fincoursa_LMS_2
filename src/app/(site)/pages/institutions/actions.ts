"use server";
import { headers } from "next/headers";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/env";
import { allow, clientIp, LIMITS, TOO_MANY } from "@/lib/rate-limit";
import { createLeadFromEnquiry, ORG_TYPES } from "@/lib/growth";

const schema = z.object({
  contact_name: z.string().trim().min(1).max(200),
  email: z.email().max(320),
  organization: z.string().trim().min(1).max(200),
  org_type: z.enum(ORG_TYPES.map(([v]) => v) as [string, ...string[]]),
  role: z.string().trim().max(200).optional(),
  country: z.string().trim().max(2).optional(),
  team_size: z.coerce.number().int().min(1).max(100000).optional(),
  message: z.string().trim().max(5000).optional(),
  website: z.string().max(0).optional(), // honeypot
});

export type EnquiryState = { ok: boolean; error?: string } | null;

/** "For Institutions" enquiry: becomes a lead with an instant thank-you and a proposal drafted for approval. */
export async function submitInstitutionEnquiry(_: EnquiryState, form: FormData): Promise<EnquiryState> {
  const raw = Object.fromEntries([...form.entries()].filter(([k]) => k !== "course_ids"));
  const parsed = schema.safeParse({ ...raw, team_size: raw.team_size || undefined, country: raw.country || undefined });
  if (!parsed.success) return { ok: false, error: "Please fill in your name, work email, organisation and type." };
  if (!isSupabaseConfigured) return { ok: false, error: "The form isn't connected yet." };
  if (!(await allow("contact", await clientIp(), LIMITS.contact.limit, LIMITS.contact.window))) return { ok: false, error: TOO_MANY };
  if (parsed.data.website) return { ok: true };

  const ids = form.getAll("course_ids").map(String).filter((s) => /^[0-9a-f-]{36}$/i.test(s)).slice(0, 20);
  const country = (parsed.data.country || (await headers()).get("x-vercel-ip-country") || "").toUpperCase() || null;
  const { website: _hp, ...d } = parsed.data;
  void _hp;
  try {
    await createLeadFromEnquiry({ ...d, country, course_ids: ids });
  } catch (e) {
    console.error("[institutions] enquiry", e);
    return { ok: false, error: "Something went wrong. Please try again, or email team@fincoursa.com." };
  }
  // keep a copy with the other enquiries (Admin → Leads)
  await createAdminClient().from("contact_requests").insert({
    name: d.contact_name, email: d.email, organization: d.organization, program_type: d.org_type === "university" ? "university" : "corporate",
    message: d.message ?? null, course_id: ids[0] ?? null, country,
  });
  return { ok: true };
}
