import "server-only";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Marketing attribution. A visit from a campaign (its /go/<code> link, or any link with utm_campaign=<code>)
 * is kept in two first-party cookies: fc_first (the first campaign ever, 1 year) and fc_touch (the latest, 30 days).
 * Sign-ups are credited to the first campaign; sales and institution enquiries to the latest one.
 */
export type Touch = { c?: string; s?: string; m?: string; l?: string; t?: number };
export const TOUCH_COOKIE = "fc_touch";
export const FIRST_COOKIE = "fc_first";

export function encodeTouch(t: Touch) { return encodeURIComponent(JSON.stringify(t)); }
function decode(v?: string): Touch | null {
  if (!v) return null;
  try { const t = JSON.parse(decodeURIComponent(v)); return t && typeof t === "object" ? t : null; } catch { return null; }
}

async function campaignId(code?: string) {
  if (!code || !/^[a-z0-9-]{3,60}$/.test(code)) return null;
  const { data } = await createAdminClient().from("campaigns").select("id").eq("code", code).maybeSingle();
  return data?.id ?? null;
}

export async function currentTouches() {
  const jar = await cookies();
  return { first: decode(jar.get(FIRST_COOKIE)?.value), last: decode(jar.get(TOUCH_COOKIE)?.value) };
}

/** New account: remember where this person first came from (only once). */
export async function attributeSignup(userId: string) {
  const { first, last } = await currentTouches();
  const t = first ?? last;
  if (!t) return;
  await createAdminClient().from("profiles").update({ acquisition: t, acquired_campaign_id: await campaignId(t.c) })
    .eq("id", userId).is("acquisition", null);
}

/** A checkout or enquiry: the latest campaign touch (within 30 days), else the person's first campaign. */
export async function attributionFor(userId?: string | null) {
  const { first, last } = await currentTouches();
  if (userId) await attributeSignup(userId); // people who signed up before tracking existed
  const t = last ?? first;
  let id = await campaignId(t?.c);
  if (!id && userId) {
    const { data } = await createAdminClient().from("profiles").select("acquired_campaign_id").eq("id", userId).maybeSingle();
    id = data?.acquired_campaign_id ?? null;
  }
  return { campaign_id: id, touch: t ?? null };
}
