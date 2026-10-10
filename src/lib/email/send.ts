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
  if (dup) return false; // unique (template, ref): already handled

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
    const res = await fetch("https://api.resend.com/emails", {
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
    // remove the marker so a later retry can send it
    await db.from("email_log").delete().eq("template", e.template).eq("ref", e.ref);
    return false;
  }
}
