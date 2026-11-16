import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";

const key = () => process.env.UNSUBSCRIBE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "dev-unsubscribe";
const sign = (userId: string) => createHmac("sha256", key()).update(`unsubscribe:${userId}`).digest("base64url").slice(0, 32);

/** Personal unsubscribe link: works without signing in, can't be guessed for someone else. */
export const unsubscribeUrl = (userId: string) => `${env.siteUrl}/unsubscribe?u=${userId}&t=${sign(userId)}`;

export function verifyUnsubscribe(userId: string, token: string) {
  if (!/^[0-9a-f-]{36}$/i.test(userId)) return false;
  const a = Buffer.from(sign(userId)), b = Buffer.from(String(token));
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Unsubscribe link for an imported contact (no FinCoursa account). */
export const contactUnsubscribeUrl = (contactId: string) => `${env.siteUrl}/unsubscribe?c=${contactId}&t=${sign(`c:${contactId}`)}`;

export function verifyContactUnsubscribe(contactId: string, token: string) {
  if (!/^[0-9a-f-]{36}$/i.test(contactId)) return false;
  const a = Buffer.from(sign(`c:${contactId}`)), b = Buffer.from(String(token));
  return a.length === b.length && timingSafeEqual(a, b);
}
