import "server-only";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/env";

/** Client IP as seen by Vercel (first hop of x-forwarded-for). */
export async function clientIp() {
  const h = await headers();
  return (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "unknown").trim();
}

/**
 * Fixed-window limit stored in Postgres. Returns true when allowed.
 * Fails open if the database can't be reached, so an outage of the limiter never locks users out.
 */
export async function allow(bucket: string, id: string, limit: number, windowSeconds: number) {
  if (!isSupabaseConfigured || !process.env.SUPABASE_SERVICE_ROLE_KEY) return true;
  const { data, error } = await createAdminClient().rpc("hit_rate_limit", {
    p_key: `${bucket}:${id}`.slice(0, 200), p_limit: limit, p_window_seconds: windowSeconds,
  });
  if (error) { console.error("[rate-limit]", error.message); return true; }
  return data !== false;
}

export const LIMITS = {
  signInPassword: { limit: 10, window: 15 * 60 },   // per IP+email
  signInLink: { limit: 5, window: 60 * 60 },        // per email
  signInIp: { limit: 30, window: 60 * 60 },         // per IP, any email
  signUp: { limit: 5, window: 60 * 60 },            // per IP
  passwordReset: { limit: 5, window: 60 * 60 },     // per email
  checkout: { limit: 20, window: 10 * 60 },         // per user
  contact: { limit: 5, window: 60 * 60 },           // per IP
  upload: { limit: 120, window: 60 * 60 },          // per user
  affiliateApply: { limit: 5, window: 24 * 60 * 60 },
} as const;

export const TOO_MANY = "Too many attempts. Please wait a few minutes and try again.";
