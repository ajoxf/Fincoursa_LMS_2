import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export type Email = {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Template name + a reference (order id, certificate id…). The pair is unique: an event never emails twice. */
  template: string;
  ref: string;
  replyTo?: string;
};

const FROM = () => process.env.EMAIL_FROM ?? "FinCoursa Academy <no-reply@fincoursa.com>";

/**
 * Sends one transactional email through Resend (RESEND_API_KEY). Without a key the email is
 * logged as "skipped" and printed to the server log, so flows work in development.
 * Returns false when this (template, ref) was already sent.
 */
export async function sendEmail(e: Email): Promise<boolean> {
  const db = createAdminClient();
  const { error: dup } = await db.from("email_log").insert({ template: e.template, ref: e.ref, to_email: e.to, status: "sent" });
  if (dup) {
    // unique (template, ref): already handled, unless the earlier attempt failed (then try again)
    const { data: retry } = await db.from("email_log").update({ status: "sent", error: null, to_email: e.to })
      .eq("template", e.template).eq("ref", e.ref).eq("status", "failed").select("id");
    if (!retry?.length) return false;
  }

  const key = process.env.RESEND_API_KEY;
  // Development only: with no provider key, EMAIL_CAPTURE_DIR saves each email as an .html file to inspect
  if (!key && process.env.EMAIL_CAPTURE_DIR) {
    const fs = await import("node:fs/promises");
    const file = `${process.env.EMAIL_CAPTURE_DIR}/${Date.now()}-${e.template}.html`;
    await fs.mkdir(process.env.EMAIL_CAPTURE_DIR, { recursive: true });
    await fs.writeFile(file, `<!-- to: ${e.to} | subject: ${e.subject} -->\n${e.html}`);
  }
  if (!key) {
    console.info(`[email:skipped] ${e.template} → ${e.to}: ${e.subject}`);
    await db.from("email_log").update({ status: "skipped" }).eq("template", e.template).eq("ref", e.ref);
    return true;
  }
  try {
    const res = await fetch(`${process.env.RESEND_API_BASE ?? "https://api.resend.com"}/emails`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM(), to: [e.to], subject: e.subject, html: e.html, text: e.text, reply_to: e.replyTo ?? process.env.EMAIL_REPLY_TO }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body?.message ?? `HTTP ${res.status}`);
    await db.from("email_log").update({ provider_id: body.id ?? null }).eq("template", e.template).eq("ref", e.ref);
    return true;
  } catch (err) {
    console.error(`[email:failed] ${e.template} → ${e.to}`, err);
    // keep the reason for the email log; a later attempt for the same (template, ref) retries it
    await db.from("email_log").update({ status: "failed", error: String(err instanceof Error ? err.message : err).slice(0, 500) })
      .eq("template", e.template).eq("ref", e.ref);
    return false;
  }
}

export type BatchEmail = Email & { headers?: Record<string, string> };

/**
 * Send up to 100 emails in one Resend call (bulk campaigns). Each (template, ref) is claimed in
 * email_log first, so a person is never emailed twice for the same campaign even if a batch is retried.
 * Returns per-email outcome: "sent", "duplicate", "skipped" (no provider key) or "failed".
 */
export async function sendEmailBatch(emails: BatchEmail[]): Promise<("sent" | "duplicate" | "skipped" | "failed")[]> {
  const db = createAdminClient();
  const out: ("sent" | "duplicate" | "skipped" | "failed")[] = [];
  const claimed: { i: number; e: BatchEmail }[] = [];
  // one round trip: rows that already exist are left alone and not returned
  const { data: fresh, error } = await db.from("email_log")
    .upsert(emails.map((e) => ({ template: e.template, ref: e.ref, to_email: e.to, status: "sent" })), { onConflict: "template,ref", ignoreDuplicates: true })
    .select("ref");
  if (error) throw new Error(error.message);
  const isNew = new Set((fresh ?? []).map((r) => r.ref));
  for (const [i, e] of emails.entries()) {
    out[i] = isNew.has(e.ref) ? "sent" : "duplicate";
    if (isNew.has(e.ref)) claimed.push({ i, e });
  }
  if (!claimed.length) return out;
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    if (process.env.EMAIL_CAPTURE_DIR) {
      const fs = await import("node:fs/promises");
      await fs.mkdir(process.env.EMAIL_CAPTURE_DIR, { recursive: true });
      for (const { e } of claimed.slice(0, 3)) await fs.writeFile(`${process.env.EMAIL_CAPTURE_DIR}/${Date.now()}-${e.template}.html`, `<!-- to: ${e.to} | subject: ${e.subject} -->\n${e.html}`);
    }
    console.info(`[email:skipped] batch of ${claimed.length} (${claimed[0].e.template})`);
    for (const { i, e } of claimed) { out[i] = "skipped"; await db.from("email_log").update({ status: "skipped" }).eq("template", e.template).eq("ref", e.ref); }
    return out;
  }
  try {
    const res = await fetch(`${process.env.RESEND_API_BASE ?? "https://api.resend.com"}/emails/batch`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(claimed.map(({ e }) => ({
        from: FROM(), to: [e.to], subject: e.subject, html: e.html, text: e.text,
        reply_to: e.replyTo ?? process.env.EMAIL_REPLY_TO, headers: e.headers,
      }))),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body?.message ?? `HTTP ${res.status}`);
    const ids: { id: string }[] = body?.data ?? [];
    for (const [k, { e }] of claimed.entries()) {
      if (ids[k]?.id) await db.from("email_log").update({ provider_id: ids[k].id }).eq("template", e.template).eq("ref", e.ref);
    }
    return out;
  } catch (err) {
    console.error(`[email:failed] batch of ${claimed.length}`, err);
    for (const { i, e } of claimed) { out[i] = "failed"; await db.from("email_log").delete().eq("template", e.template).eq("ref", e.ref); }
    return out;
  }
}
