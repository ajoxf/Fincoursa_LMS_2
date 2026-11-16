import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmailBatch, type BatchEmail } from "@/lib/email/send";
import { messageEmail } from "@/lib/email/templates";
import { contactUnsubscribeUrl, unsubscribeUrl } from "@/lib/email/unsubscribe";
import { getDesign, renderDesign, type EmailDesign } from "@/lib/email/designs";
import { env } from "@/lib/env";
import { addTracking } from "@/lib/email/tracking";

export type CampaignKind = "promotion" | "update" | "announcement";
export type Audience = { courses?: string[]; countries?: string[]; buyers_only?: boolean };

export const KIND_LABEL: Record<CampaignKind, string> = {
  promotion: "Newsletter / promotion",
  update: "Important update",
  announcement: "Course update",
};

/** How many people a campaign would reach right now. */
export async function audienceCount(kind: CampaignKind, a: Audience): Promise<number> {
  // a HEAD request sends arguments in the URL, so leave out empty ones (the function defaults them)
  const args: Record<string, unknown> = { p_kind: kind, p_buyers_only: Boolean(a.buyers_only) };
  if (a.courses?.length) args.p_courses = `{${a.courses.join(",")}}`;
  if (a.countries?.length) args.p_countries = `{${a.countries.join(",")}}`;
  const { count, error } = await createAdminClient().rpc("campaign_audience", args, { count: "exact", head: true });
  if (error) throw new Error(error.message || `Could not count the audience (${error.code ?? "unknown"})`);
  return count ?? 0;
}

/** Turn "/pages/paid-courses" into a full link; only http(s) links are allowed. */
export function cleanUrl(u: string | null | undefined): string | null {
  const v = (u ?? "").trim();
  if (!v) return null;
  if (v.startsWith("/")) return `${env.siteUrl}${v}`;
  return /^https?:\/\/[^\s]+$/i.test(v) ? v : null;
}

type CampaignRow = {
  id: string; kind: CampaignKind; subject: string; heading: string; body: string; cta_label: string | null; cta_url: string | null;
  status: string; total: number; design?: string | null;
};

/** Click tag for one email campaign: links carry ?v=<tag>, so Admin can count its clicks (campaign_clicks.variant). */
export const campaignTag = (id: string) => `e-${id.slice(0, 8)}`;

/** recipientId: the email_campaign_recipients row; when set, opens and clicks are tracked for that person. */
export type Recipient = { userId?: string | null; contactId?: string | null; name?: string | null; recipientId?: number | null };

/** Render one person's copy of a campaign. A designed campaign needs its design passed in (see getDesign). */
export function renderCampaign(c: Pick<CampaignRow, "kind" | "subject" | "heading" | "body" | "cta_label" | "cta_url"> & { id?: string; design?: string | null }, to: Recipient, design?: Pick<EmailDesign, "html" | "text_body"> | null) {
  const unsub = to.contactId ? contactUnsubscribeUrl(to.contactId) : unsubscribeUrl(to.userId!);
  const oneClickUrl = unsub.replace("/unsubscribe?", "/api/unsubscribe?");
  const listHeaders = { "List-Unsubscribe": `<${oneClickUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" };
  if (c.design && c.design !== "message") {
    if (!design) throw new Error("This email's design could not be found");
    const d = renderDesign(design, { tag: c.id ? campaignTag(c.id) : "email", unsubscribeUrl: unsub, note: c.body, firstName: to.name });
    return { subject: c.subject, html: to.recipientId ? addTracking(d.html, to.recipientId) : d.html, text: d.text, headers: listHeaders };
  }
  const m = messageEmail({
    subject: c.subject, heading: c.heading, body: c.body, name: to.name,
    cta: c.cta_label && c.cta_url ? { label: c.cta_label, url: c.cta_url } : null,
    footer: c.kind === "promotion" ? "You're receiving this because you agreed to hear from FinCoursa about new courses and offers."
      : "You're receiving this because you're enrolled with FinCoursa.",
    unsubscribeUrl: unsub,
  });
  const headers = c.kind === "promotion" ? listHeaders : undefined;
  return { ...m, html: to.recipientId ? addTracking(m.html, to.recipientId) : m.html, headers };
}

async function refreshCounts(id: string) {
  const db = createAdminClient();
  const n = async (status: string) =>
    (await db.from("email_campaign_recipients").select("id", { count: "exact", head: true }).eq("campaign_id", id).eq("status", status)).count ?? 0;
  const [sent, failed, skipped, pending] = await Promise.all([n("sent"), n("failed"), n("skipped"), n("pending")]);
  const patch: Record<string, unknown> = { sent, failed, skipped };
  if (pending === 0) { patch.status = "sent"; patch.finished_at = new Date().toISOString(); }
  await db.from("email_campaigns").update(patch).eq("id", id).in("status", ["sending", "scheduled"]);
  return { sent, failed, skipped, pending };
}

/**
 * Send the next batch of a campaign (default 50 people, one provider call). Safe to call repeatedly and
 * concurrently: each person is claimed once in the email log, so nobody gets the same campaign twice.
 */
export async function sendCampaignBatch(id: string, size = 50) {
  const db = createAdminClient();
  const { data: c } = await db.from("email_campaigns").select("id, kind, subject, heading, body, cta_label, cta_url, status, total, started_at, design").eq("id", id).single();
  if (!c) throw new Error("Campaign not found");
  if (c.status === "cancelled" || c.status === "sent" || c.status === "draft" || c.status === "awaiting_approval") return { total: c.total, ...(await refreshCounts(id)), status: c.status };
  if (!c.started_at || c.status === "scheduled") await db.from("email_campaigns").update({ status: "sending", started_at: c.started_at ?? new Date().toISOString() }).eq("id", id);

  const { data: batch } = await db.from("email_campaign_recipients").select("id, user_id, contact_id, email, name").eq("campaign_id", id).eq("status", "pending").limit(size);
  if (batch?.length) {
    const design = await getDesign(c.design);
    const emails: BatchEmail[] = batch.map((r) => ({
      to: r.email, ...renderCampaign(c as CampaignRow, { userId: r.user_id, contactId: r.contact_id, name: r.name, recipientId: r.id }, design),
      template: "campaign", ref: `${id}:${r.user_id ?? `c:${r.contact_id}`}`,
    }));
    const results = await sendEmailBatch(emails);
    const now = new Date().toISOString();
    const by = (want: string[]) => batch.filter((_, i) => want.includes(results[i])).map((r) => r.id);
    const sent = by(["sent", "duplicate"]), skipped = by(["skipped"]), failed = by(["failed"]);
    if (sent.length) await db.from("email_campaign_recipients").update({ status: "sent", sent_at: now }).eq("campaign_id", id).in("id", sent);
    if (skipped.length) await db.from("email_campaign_recipients").update({ status: "skipped", sent_at: now, error: "No email provider key (RESEND_API_KEY)" }).eq("campaign_id", id).in("id", skipped);
    if (failed.length) await db.from("email_campaign_recipients").update({ status: "failed", error: "Provider rejected the batch" }).eq("campaign_id", id).in("id", failed);
  }
  const counts = await refreshCounts(id);
  return { total: c.total, ...counts, status: counts.pending === 0 ? "sent" : "sending" };
}

/** Daily job: start scheduled campaigns that are due and keep sending until the time budget runs out. */
export async function processScheduledCampaigns(budgetMs = 240_000) {
  const db = createAdminClient();
  const start = Date.now();
  const { data: due } = await db.from("email_campaigns").select("id, total, status")
    .or(`and(status.eq.scheduled,scheduled_for.lte.${new Date().toISOString()}),status.eq.sending`).order("created_at");
  let sent = 0;
  for (const c of due ?? []) {
    if (c.status === "scheduled" && !c.total) await db.rpc("enqueue_campaign", { p_campaign: c.id });
    while (Date.now() - start < budgetMs) {
      const r = await sendCampaignBatch(c.id, 100);
      sent += r.sent;
      if (r.pending === 0) break;
    }
  }
  return sent;
}
