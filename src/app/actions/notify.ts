"use server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/env";
import { allow, clientIp, LIMITS, TOO_MANY } from "@/lib/rate-limit";
import { headers } from "next/headers";

const schema = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.email().max(320),
  website: z.string().max(0).optional(), // honeypot
});

export type NotifyState = { ok: boolean; error?: string } | null;

/** Waitlist for a "Coming soon" course. Stored with the contact enquiries so it shows in Admin → Leads. */
export async function notifyMe(courseId: string, _: NotifyState, form: FormData): Promise<NotifyState> {
  const parsed = schema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, error: "Please check your name and email." };
  if (!isSupabaseConfigured) return { ok: false, error: "Sign-ups aren't connected yet." };
  if (!(await allow("contact", await clientIp(), LIMITS.contact.limit, LIMITS.contact.window))) return { ok: false, error: TOO_MANY };
  if (parsed.data.website) return { ok: true }; // bot filled the honeypot
  const db = createAdminClient();
  const { data: course } = await db.from("courses").select("title").eq("id", courseId).maybeSingle();
  if (!course) return { ok: false, error: "This course is no longer available." };
  const { error } = await db.from("contact_requests").insert({
    name: parsed.data.name, email: parsed.data.email, program_type: "waitlist",
    message: `Notify me when "${course.title}" launches.`, course_id: courseId,
    country: ((await headers()).get("x-vercel-ip-country") || "").toUpperCase() || null,
  });
  if (error) return { ok: false, error: "Something went wrong. Please try again." };
  return { ok: true };
}
