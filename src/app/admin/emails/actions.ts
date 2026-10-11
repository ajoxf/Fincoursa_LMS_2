"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { audienceCount, cleanUrl, renderCampaign, sendCampaignBatch, type Audience, type CampaignKind } from "@/lib/campaigns";
import { sendEmail } from "@/lib/email/send";

const schema = z.object({
  kind: z.enum(["promotion", "update"]),
  subject: z.string().trim().min(1, "Add a subject line").max(150),
  heading: z.string().trim().max(150).optional(),
  body: z.string().trim().min(1, "Write the message").max(20000),
  cta_label: z.string().trim().max(40).optional(),
  cta_url: z.string().trim().max(1000).optional(),
});

export type ComposeState = { ok: boolean; message: string; campaignId?: string; total?: number } | null;

function readAudience(form: FormData): Audience {
  const courses = form.getAll("courses").map(String).filter((c) => /^[0-9a-f-]{36}$/i.test(c));
  const countries = String(form.get("countries") ?? "").toUpperCase().split(/[^A-Z]+/).filter((c) => /^[A-Z]{2}$/.test(c));
  return { courses, countries: [...new Set(countries)], buyers_only: form.get("buyers_only") === "on" };
}

function readMessage(form: FormData) {
  const r = schema.safeParse(Object.fromEntries(form));
  if (!r.success) return { error: r.error.issues[0].message } as const;
  const d = r.data;
  const url = cleanUrl(d.cta_url);
  if (d.cta_label && !url) return { error: "The button link must start with https:// (or /, for a page on this site)" } as const;
  return { msg: { kind: d.kind as CampaignKind, subject: d.subject, heading: d.heading || d.subject, body: d.body, cta_label: d.cta_label && url ? d.cta_label : null, cta_url: d.cta_label && url ? url : null } } as const;
}

export async function countAudience(kind: CampaignKind, audience: Audience) {
  await requireRole(["admin"]);
  return audienceCount(kind === "promotion" ? "promotion" : "update", audience);
}

/** The email exactly as a student sees it, for the preview pane. */
export async function previewEmail(form: FormData): Promise<{ html?: string; subject?: string; error?: string }> {
  const me = await requireRole(["admin"]);
  const m = readMessage(form);
  if ("error" in m) return { error: m.error };
  const r = renderCampaign(m.msg, { userId: me.id, name: me.fullName });
  return { html: r.html, subject: r.subject };
}

export async function sendTestEmail(form: FormData): Promise<ComposeState> {
  const me = await requireRole(["admin"]);
  const m = readMessage(form);
  if ("error" in m) return { ok: false, message: m.error! };
  if (!me.email) return { ok: false, message: "Your account has no email address" };
  const r = renderCampaign(m.msg, { userId: me.id, name: me.fullName });
  await sendEmail({ to: me.email, subject: `[Test] ${r.subject}`, html: r.html, text: r.text, template: "campaign_test", ref: `${me.id}:${Date.now()}` });
  return { ok: true, message: process.env.RESEND_API_KEY ? `Test sent to ${me.email}.` : `Test prepared for ${me.email}, but no email provider is connected yet (RESEND_API_KEY), so nothing was delivered.` };
}

/** Save the campaign, freeze the recipient list, and either start sending (the page then sends batch by batch) or schedule it. */
export async function createCampaign(_: ComposeState, form: FormData): Promise<ComposeState> {
  const me = await requireRole(["admin"]);
  const m = readMessage(form);
  if ("error" in m) return { ok: false, message: m.error! };
  const audience = readAudience(form);
  const when = String(form.get("send_on") ?? "").trim();
  const schedule = form.get("mode") === "schedule";
  if (schedule && !/^\d{4}-\d{2}-\d{2}$/.test(when)) return { ok: false, message: "Pick a date to schedule it for" };
  const count = await audienceCount(m.msg.kind, audience);
  if (!count) return { ok: false, message: "Nobody matches this audience yet." };

  const db = createAdminClient();
  const { data: c, error } = await db.from("email_campaigns").insert({
    ...m.msg, audience, created_by: me.id,
    status: schedule ? "scheduled" : "sending",
    // the daily job runs at 01:00 UTC (05:00 UAE)
    scheduled_for: schedule ? new Date(`${when}T00:00:00Z`).toISOString() : null,
  }).select("id").single();
  if (error || !c) return { ok: false, message: error?.message ?? "Could not save" };
  await db.from("audit_log").insert({ actor_id: me.id, action: schedule ? "campaign.scheduled" : "campaign.started", entity: "email_campaigns", entity_id: c.id, data: { kind: m.msg.kind, audience, count } });
  revalidatePath("/admin/emails");
  if (schedule) return { ok: true, message: `Scheduled for ${when}, around 5:00 AM UAE time. It will go to everyone who matches on that day (about ${count} people today).` };
  const { data: total, error: qErr } = await db.rpc("enqueue_campaign", { p_campaign: c.id });
  if (qErr) return { ok: false, message: qErr.message };
  return { ok: true, message: "Sending…", campaignId: c.id, total: Number(total) };
}

export async function sendNextBatch(id: string) {
  await requireRole(["admin"]);
  const r = await sendCampaignBatch(id, 50);
  if (r.pending === 0) revalidatePath("/admin/emails");
  return r;
}

export async function cancelCampaign(id: string) {
  const me = await requireRole(["admin"]);
  const db = createAdminClient();
  await db.from("email_campaigns").update({ status: "cancelled", finished_at: new Date().toISOString() }).eq("id", id).in("status", ["scheduled", "sending"]);
  await db.from("audit_log").insert({ actor_id: me.id, action: "campaign.cancelled", entity: "email_campaigns", entity_id: id });
  revalidatePath("/admin/emails");
}

/** Put people whose email failed back in the queue and resume sending. */
export async function retryFailed(id: string) {
  await requireRole(["admin"]);
  const db = createAdminClient();
  await db.from("email_campaign_recipients").update({ status: "pending", error: null }).eq("campaign_id", id).eq("status", "failed");
  await db.from("email_campaigns").update({ status: "sending", finished_at: null }).eq("id", id).in("status", ["sent", "sending"]);
  revalidatePath("/admin/emails");
}
