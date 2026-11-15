import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSetting } from "@/lib/site-settings";

/**
 * Keeps the Resend contact list in step with marketing consent on the site.
 * - Opted in on the site -> contact exists in Resend and is in the list (site_settings "email_list".segment_id).
 * - Opted out on the site -> contact is marked unsubscribed in Resend.
 * - Unsubscribed in Resend (e.g. from a broadcast's unsubscribe link) -> opted out on the site too.
 *   The sync never re-subscribes someone Resend has marked unsubscribed.
 */
type ListSettings = { segment_id?: string | null };
type Result = "synced" | "skipped" | "failed";

const base = () => process.env.RESEND_API_BASE ?? "https://api.resend.com";

async function api(method: string, path: string, body?: object) {
  const res = await fetch(`${base()}${path}`, {
    method,
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  let json: unknown = null;
  try { json = await res.json(); } catch { /* empty body */ }
  return { ok: res.ok, status: res.status, json: json as Record<string, unknown> | null };
}

const splitName = (full?: string | null) => {
  const parts = (full ?? "").trim().split(/\s+/).filter(Boolean);
  return { first_name: parts[0] ?? "", last_name: parts.slice(1).join(" ") };
};

/** Add the contact to the list: the segments endpoint, or the older audiences endpoint as a fallback. */
async function addToList(email: string, segmentId: string, names: { first_name: string; last_name: string }) {
  const e = encodeURIComponent(email);
  const viaSegment = await api("POST", `/contacts/${e}/segments/${segmentId}`);
  if (viaSegment.ok || viaSegment.status === 409) return true;
  const viaAudience = await api("POST", `/audiences/${segmentId}/contacts`, { email, ...names, unsubscribed: false });
  return viaAudience.ok || viaAudience.status === 409;
}

export async function syncEmailContact(userId: string): Promise<Result> {
  if (!process.env.RESEND_API_KEY) return "skipped";
  const db = createAdminClient();
  const { data: p } = await db.from("profiles").select("email, full_name, marketing_opt_in").eq("id", userId).maybeSingle();
  if (!p?.email) return "skipped";
  const email = p.email.toLowerCase();
  const e = encodeURIComponent(email);
  const names = splitName(p.full_name);
  const mark = (v: boolean) => db.from("profiles").update({ email_list_synced: v }).eq("id", userId);

  try {
    const existing = await api("GET", `/contacts/${e}`);
    const found = existing.ok && existing.json && !("statusCode" in existing.json);

    if (!p.marketing_opt_in) {
      if (found && existing.json?.unsubscribed !== true) {
        const r = await api("PATCH", `/contacts/${e}`, { unsubscribed: true });
        if (!r.ok) return "failed";
      }
      await mark(false);
      return "synced";
    }

    // they unsubscribed from a Resend email: respect it on the site as well
    if (found && existing.json?.unsubscribed === true) {
      await db.from("profiles").update({ marketing_opt_in: false, email_list_synced: false }).eq("id", userId);
      return "synced";
    }

    if (!found) {
      const r = await api("POST", "/contacts", { email, ...names, unsubscribed: false });
      if (!r.ok && r.status !== 409) return "failed";
    } else if (names.first_name) {
      await api("PATCH", `/contacts/${e}`, names); // names only; never touches the unsubscribed flag
    }
    const list = (await getSetting<ListSettings>("email_list"))?.segment_id;
    if (list && !(await addToList(email, list, names))) return "failed";
    await mark(true);
    return "synced";
  } catch (err) {
    console.error("[email-list] sync", err);
    return "failed";
  }
}

/** Daily: catch up anyone whose consent changed but isn't reflected in Resend yet (or failed earlier). */
export async function syncPendingEmailContacts(limit = 60) {
  if (!process.env.RESEND_API_KEY) return { synced: 0, failed: 0 };
  const db = createAdminClient();
  const { data: rows } = await db.from("profiles").select("id, marketing_opt_in, email_list_synced")
    .or("and(marketing_opt_in.eq.true,email_list_synced.is.null),and(marketing_opt_in.eq.true,email_list_synced.eq.false),and(marketing_opt_in.eq.false,email_list_synced.eq.true)")
    .limit(limit);
  let synced = 0, failed = 0;
  for (const r of rows ?? []) {
    const res = await syncEmailContact(r.id);
    if (res === "synced") synced++; else if (res === "failed") failed++;
    await new Promise((ok) => setTimeout(ok, 600)); // stay under Resend's request rate limit
  }
  return { synced, failed };
}
