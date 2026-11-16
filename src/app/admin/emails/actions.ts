"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { cleanUrl, renderCampaign, sendCampaignBatch, type Audience, type CampaignKind } from "@/lib/campaigns";
import { getDesign, type EmailDesign } from "@/lib/email/designs";
import { sendEmail } from "@/lib/email/send";

/** Admins send and approve. The team (support role) drafts, sends themselves tests and submits for approval. */
const STAFF = ["admin", "support"] as const;
const isAdmin = (roles: string[]) => roles.includes("admin");

const schema = z.object({
  kind: z.enum(["promotion", "update"]),
  design: z.string().optional(),
  subject: z.string().trim().min(1, "Add a subject line").max(150),
  heading: z.string().trim().max(150).optional(),
  body: z.string().trim().max(20000).optional(),
  cta_label: z.string().trim().max(40).optional(),
  cta_url: z.string().trim().max(1000).optional(),
});

export type ComposeState = { ok: boolean; message: string; campaignId?: string; total?: number } | null;
type Options = { include_contacts: boolean; exclude_buyers_of: string | null };

function readAudience(form: FormData): Audience {
  const courses = form.getAll("courses").map(String).filter((c) => /^[0-9a-f-]{36}$/i.test(c));
  const countries = String(form.get("countries") ?? "").toUpperCase().split(/[^A-Z]+/).filter((c) => /^[A-Z]{2}$/.test(c));
  return { courses, countries: [...new Set(countries)], buyers_only: form.get("buyers_only") === "on" };
}

function readOptions(form: FormData): Options {
  const ex = String(form.get("exclude_buyers_of") ?? "");
  return { include_contacts: form.get("include_contacts") === "on", exclude_buyers_of: /^[0-9a-f-]{36}$/i.test(ex) ? ex : null };
}

async function readMessage(form: FormData) {
  const r = schema.safeParse(Object.fromEntries(form));
  if (!r.success) return { error: r.error.issues[0].message } as const;
  const d = r.data;
  if (d.design && d.design !== "message") {
    // a designed email: the body is an optional personal note above the design; always a promotion
    const found = await getDesign(d.design);
    if (!found || found.status !== "approved") return { error: "That design isn't approved for sending. Pick another one." } as const;
    return { template: found as EmailDesign, msg: { kind: "promotion" as CampaignKind, design: found.id, subject: d.subject, heading: d.subject, body: d.body ?? "", cta_label: null, cta_url: null } } as const;
  }
  const design = "message";
  if (!d.body) return { error: "Write the message" } as const;
  const url = cleanUrl(d.cta_url);
  if (d.cta_label && !url) return { error: "The button link must start with https:// (or /, for a page on this site)" } as const;
  return { msg: { kind: d.kind as CampaignKind, design, subject: d.subject, heading: d.heading || d.subject, body: d.body, cta_label: d.cta_label && url ? d.cta_label : null, cta_url: d.cta_label && url ? url : null } } as const;
}

async function recipientCount(kind: CampaignKind, a: Audience, o: Options) {
  const args: Record<string, unknown> = {
    p_kind: kind, p_buyers_only: Boolean(a.buyers_only), p_include_contacts: o.include_contacts, p_exclude_buyers_of: o.exclude_buyers_of,
    p_courses: a.courses?.length ? a.courses : null, p_countries: a.countries?.length ? a.countries : null,
  };
  const { data, error } = await createAdminClient().rpc("campaign_recipient_count", args);
  if (error) throw new Error(error.message);
  return Number(data ?? 0);
}

export async function countAudience(kind: CampaignKind, audience: Audience, options: Options) {
  await requireRole([...STAFF]);
  return recipientCount(kind === "promotion" ? "promotion" : "update", audience, options);
}

/** The email exactly as people see it, for the preview pane. */
export async function previewEmail(form: FormData): Promise<{ html?: string; subject?: string; error?: string }> {
  const me = await requireRole([...STAFF]);
  const m = await readMessage(form);
  if ("error" in m) return { error: m.error };
  const r = renderCampaign(m.msg, { userId: me.id, name: me.fullName }, "template" in m ? m.template : null);
  return { html: r.html, subject: r.subject };
}

/** Send the email to yourself, or to one address you type (e.g. team@fincoursa.com). */
export async function sendTestEmail(form: FormData): Promise<ComposeState> {
  const me = await requireRole([...STAFF]);
  const m = await readMessage(form);
  if ("error" in m) return { ok: false, message: m.error! };
  const typed = String(form.get("test_to") ?? "").trim().toLowerCase();
  const to = typed || me.email;
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return { ok: false, message: "Enter a valid email address for the test" };
  const r = renderCampaign(m.msg, { userId: me.id, name: me.fullName }, "template" in m ? m.template : null);
  await sendEmail({ to, subject: `[Test] ${r.subject}`, html: r.html, text: r.text, template: "campaign_test", ref: `${me.id}:${Date.now()}` });
  return { ok: true, message: process.env.RESEND_API_KEY ? `Test sent to ${to}.` : `Test prepared for ${to}, but no email provider is connected yet (RESEND_API_KEY), so nothing was delivered.` };
}

/**
 * Admins: save and send now (the page then sends batch by batch) or schedule.
 * Team: save and submit for an admin's approval, with the chosen send-now / schedule choice.
 */
export async function createCampaign(_: ComposeState, form: FormData): Promise<ComposeState> {
  const me = await requireRole([...STAFF]);
  const m = await readMessage(form);
  if ("error" in m) return { ok: false, message: m.error! };
  const audience = readAudience(form);
  const options = readOptions(form);
  const when = String(form.get("send_on") ?? "").trim();
  const schedule = form.get("mode") === "schedule";
  if (schedule && !/^\d{4}-\d{2}-\d{2}$/.test(when)) return { ok: false, message: "Pick a date to schedule it for" };
  const count = await recipientCount(m.msg.kind, audience, options);
  if (!count) return { ok: false, message: "Nobody matches this audience yet." };

  const admin = isAdmin(me.roles);
  const db = createAdminClient();
  const { data: c, error } = await db.from("email_campaigns").insert({
    ...m.msg, audience, ...options, created_by: me.id,
    status: !admin ? "awaiting_approval" : schedule ? "scheduled" : "sending",
    send_mode: schedule ? "schedule" : "now",
    submitted_by: admin ? null : me.id,
    approved_by: admin ? me.id : null, approved_at: admin ? new Date().toISOString() : null,
    // the daily job runs at 01:00 UTC (05:00 UAE)
    scheduled_for: schedule ? new Date(`${when}T00:00:00Z`).toISOString() : null,
  }).select("id").single();
  if (error || !c) return { ok: false, message: error?.message ?? "Could not save" };
  await db.from("audit_log").insert({ actor_id: me.id, action: !admin ? "campaign.submitted" : schedule ? "campaign.scheduled" : "campaign.started", entity: "email_campaigns", entity_id: c.id, data: { kind: m.msg.kind, design: m.msg.design, audience, ...options, count } });
  revalidatePath("/admin/emails");
  if (!admin) return { ok: true, message: `Sent for approval. An admin will check it and ${schedule ? `schedule it for ${when}` : "send it"}. It goes to about ${count} people today.` };
  if (schedule) return { ok: true, message: `Scheduled for ${when}, around 5:00 AM UAE time. It will go to everyone who matches on that day (about ${count} people today).` };
  const { data: total, error: qErr } = await db.rpc("enqueue_campaign", { p_campaign: c.id });
  if (qErr) return { ok: false, message: qErr.message };
  return { ok: true, message: "Sending…", campaignId: c.id, total: Number(total) };
}

/** Admin approves a submitted email: it is scheduled for its date, or starts sending now. */
export async function approveCampaign(id: string): Promise<ComposeState> {
  const me = await requireRole(["admin"]);
  const db = createAdminClient();
  const { data: c } = await db.from("email_campaigns").select("id, status, send_mode, scheduled_for").eq("id", id).maybeSingle();
  if (!c || c.status !== "awaiting_approval") return { ok: false, message: "This email isn't waiting for approval." };
  const later = c.send_mode === "schedule" && c.scheduled_for && new Date(c.scheduled_for).getTime() > Date.now();
  await db.from("email_campaigns").update({ status: later ? "scheduled" : "sending", approved_by: me.id, approved_at: new Date().toISOString(), scheduled_for: later ? c.scheduled_for : null }).eq("id", id);
  await db.from("audit_log").insert({ actor_id: me.id, action: "campaign.approved", entity: "email_campaigns", entity_id: id });
  revalidatePath("/admin/emails");
  if (later) return { ok: true, message: "Approved and scheduled." };
  const { data: total, error } = await db.rpc("enqueue_campaign", { p_campaign: id });
  if (error) return { ok: false, message: error.message };
  return { ok: true, message: "Approved. Sending…", campaignId: id, total: Number(total) };
}

/** Admin sends a submitted email back: it is not sent. */
export async function rejectCampaign(id: string) {
  const me = await requireRole(["admin"]);
  const db = createAdminClient();
  await db.from("email_campaigns").update({ status: "cancelled", finished_at: new Date().toISOString() }).eq("id", id).eq("status", "awaiting_approval");
  await db.from("audit_log").insert({ actor_id: me.id, action: "campaign.rejected", entity: "email_campaigns", entity_id: id });
  revalidatePath("/admin/emails");
}

export async function sendNextBatch(id: string) {
  await requireRole([...STAFF]);
  const r = await sendCampaignBatch(id, 50);
  if (r.pending === 0) revalidatePath("/admin/emails");
  return r;
}

export async function cancelCampaign(id: string) {
  const me = await requireRole(["admin"]);
  const db = createAdminClient();
  await db.from("email_campaigns").update({ status: "cancelled", finished_at: new Date().toISOString() }).eq("id", id).in("status", ["scheduled", "sending", "awaiting_approval"]);
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

/* ---------- Contacts (people without a FinCoursa account) ---------- */

const EMAIL_RE = /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[^\s@,;<>"]+$/;
const back = (k: "ok" | "err", m: string) => `/admin/emails?tab=contacts&${k}=${encodeURIComponent(m)}`;

/** Split one CSV line, allowing quoted values. */
function csvCells(line: string) {
  const out: string[] = []; let cur = ""; let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
    else if ((ch === "," || ch === ";" || ch === "\t") && !q) { out.push(cur.trim()); cur = ""; }
    else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

/** Import a CSV (email, first_name, last_name) or a pasted list. Existing emails are updated, never duplicated. */
export async function importContacts(form: FormData): Promise<void> {
  redirect(await importContactsInner(form));
}

async function importContactsInner(form: FormData): Promise<string> {
  const me = await requireRole([...STAFF]);
  if (form.get("consent") !== "on") return back("err", "Tick the box to confirm these people agreed to hear from FinCoursa.");
  const file = form.get("file");
  let text = String(form.get("pasted") ?? "");
  if (file instanceof File && file.size > 0) {
    if (file.size > 2_000_000) return back("err", "That file is too big (2 MB at most).");
    text = await file.text();
  }
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return back("err", "Choose a CSV file or paste some email addresses.");
  // header row: find the columns by name; otherwise assume email, first name, last name
  let cols = { email: 0, first: 1, last: 2 };
  const head = csvCells(lines[0]).map((h) => h.toLowerCase().replace(/[^a-z]/g, ""));
  if (head.some((h) => h.includes("email"))) {
    const find = (...names: string[]) => head.findIndex((h) => names.some((n) => h === n || h.includes(n)));
    cols = { email: find("email"), first: find("firstname", "first", "name"), last: find("lastname", "last", "surname") };
    lines.shift();
  }
  const seen = new Set<string>(); let bad = 0;
  const rows: { email: string; first_name: string | null; last_name: string | null; source: string; created_by: string }[] = [];
  const source = String(form.get("source") ?? "").trim().slice(0, 80) || `Imported ${new Date().toISOString().slice(0, 10)}`;
  for (const l of lines) {
    const cells = csvCells(l);
    const email = (cells[cols.email] ?? "").replace(/^mailto:/i, "").toLowerCase();
    if (!EMAIL_RE.test(email)) { bad++; continue; }
    if (seen.has(email)) continue;
    seen.add(email);
    rows.push({ email, first_name: (cols.first >= 0 ? cells[cols.first] : "")?.slice(0, 80) || null, last_name: (cols.last >= 0 ? cells[cols.last] : "")?.slice(0, 80) || null, source, created_by: me.id });
  }
  if (!rows.length) return back("err", `No valid email addresses found${bad ? ` (${bad} lines skipped)` : ""}.`);
  const db = createAdminClient();
  const { data: existing } = await db.from("email_contacts").select("email, unsubscribed_at").in("email", rows.map((r) => r.email));
  const known = new Map((existing ?? []).map((e) => [e.email.toLowerCase(), e]));
  const fresh = rows.filter((r) => !known.has(r.email));
  if (fresh.length) {
    const { error } = await db.from("email_contacts").insert(fresh);
    if (error) return back("err", error.message);
  }
  // existing contacts: fill in names; never re-subscribe someone who unsubscribed
  for (const r of rows.filter((x) => known.has(x.email) && (x.first_name || x.last_name))) {
    await db.from("email_contacts").update({ first_name: r.first_name, last_name: r.last_name }).ilike("email", r.email);
  }
  const unsub = rows.filter((r) => known.get(r.email)?.unsubscribed_at).length;
  await db.from("audit_log").insert({ actor_id: me.id, action: "contacts.imported", entity: "email_contacts", data: { added: fresh.length, existing: rows.length - fresh.length, skipped: bad, source } });
  revalidatePath("/admin/emails");
  return back("ok", `Added ${fresh.length} new contact${fresh.length === 1 ? "" : "s"}.${rows.length - fresh.length ? ` ${rows.length - fresh.length} were already on the list.` : ""}${unsub ? ` ${unsub} of those had unsubscribed and stay unsubscribed.` : ""}${bad ? ` ${bad} lines skipped (not an email address).` : ""}`);
}

/** Mark a contact unsubscribed (on request) or remove them completely. */
export async function updateContact(id: string, action: "unsubscribe" | "delete"): Promise<void> {
  const me = await requireRole([...STAFF]);
  const db = createAdminClient();
  if (action === "delete") await db.from("email_contacts").delete().eq("id", id);
  else await db.from("email_contacts").update({ unsubscribed_at: new Date().toISOString() }).eq("id", id).is("unsubscribed_at", null);
  await db.from("audit_log").insert({ actor_id: me.id, action: `contact.${action}`, entity: "email_contacts", entity_id: id });
  revalidatePath("/admin/emails");
}

/** Admin: approve a design (it appears in the Design list), move it back to draft, or retire it. */
export async function setDesignStatus(id: string, status: "approved" | "draft" | "retired") {
  const me = await requireRole(["admin"]);
  const db = createAdminClient();
  const { error } = await db.from("email_designs").update({
    status, updated_at: new Date().toISOString(),
    ...(status === "approved" ? { approved_by: me.id, approved_at: new Date().toISOString() } : {}),
  }).eq("id", id);
  if (error) redirect(`/admin/emails?tab=designs&err=${encodeURIComponent(error.message)}`);
  await db.from("audit_log").insert({ actor_id: me.id, action: `email_design.${status}`, entity: "email_designs", entity_id: id });
  revalidatePath("/admin/emails");
  const said = { approved: "Approved. It now appears in the Design list.", draft: "Moved back to draft.", retired: "Retired. It no longer appears in the Design list." }[status];
  redirect(`/admin/emails?tab=designs&ok=${encodeURIComponent(said)}`);
}

export type AudiencePerson = {
  email: string; name: string | null; type: "Student" | "Contact"; status?: string;
  /** after sending: what the person did (dates are ISO strings) */
  opened_at?: string | null; clicked_at?: string | null; opens?: number; clicks?: number;
  signed_up_at?: string | null; sample_at?: string | null; bought_at?: string | null; revenue_minor?: number; currency?: string | null;
};

/** The people an email would reach right now, using the same rules as enqueue_campaign. */
async function audienceList(kind: CampaignKind, a: Audience, o: Options): Promise<AudiencePerson[]> {
  const db = createAdminClient();
  const { data: students, error } = await db.rpc("campaign_audience", {
    p_kind: kind, p_buyers_only: Boolean(a.buyers_only),
    p_courses: a.courses?.length ? a.courses : null, p_countries: a.countries?.length ? a.countries : null,
  });
  if (error) throw new Error(error.message);
  let buyers = new Set<string>();
  if (o.exclude_buyers_of) {
    const { data } = await db.from("enrollments").select("user_id").eq("course_id", o.exclude_buyers_of).is("revoked_at", null).neq("source", "free");
    buyers = new Set((data ?? []).map((e) => e.user_id as string));
  }
  const out = new Map<string, AudiencePerson>();
  for (const s of (students ?? []) as { user_id: string; email: string; full_name: string | null }[]) {
    if (buyers.has(s.user_id)) continue;
    const key = s.email.toLowerCase();
    if (!out.has(key)) out.set(key, { email: s.email, name: s.full_name, type: "Student" });
  }
  if (o.include_contacts) {
    const { data: contacts } = await db.from("email_contacts").select("email, first_name, last_name").is("unsubscribed_at", null).limit(20000);
    const emails = (contacts ?? []).map((c) => c.email.toLowerCase());
    // contacts who also have an account: leave out if they opted out of marketing, or already bought
    const blocked = new Set<string>();
    for (let i = 0; i < emails.length; i += 200) {
      const { data: profs } = await db.from("profiles").select("id, email, marketing_opt_in").in("email", emails.slice(i, i + 200));
      for (const p of profs ?? []) if (p.marketing_opt_in === false || buyers.has(p.id)) blocked.add(String(p.email).toLowerCase());
    }
    for (const c of contacts ?? []) {
      const key = c.email.toLowerCase();
      if (blocked.has(key) || out.has(key)) continue;
      out.set(key, { email: key, name: [c.first_name, c.last_name].filter(Boolean).join(" ") || null, type: "Contact" });
    }
  }
  return [...out.values()].sort((x, y) => (x.name ?? x.email).localeCompare(y.name ?? y.email));
}

export async function listAudience(kind: CampaignKind, audience: Audience, options: Options) {
  await requireRole([...STAFF]);
  return audienceList(kind === "promotion" ? "promotion" : "update", audience, options);
}

/** Who a saved email went to (with each person's status), or for one not sent yet, who it would go to today. */
export async function campaignRecipients(id: string): Promise<{ people: AudiencePerson[]; frozen: boolean }> {
  await requireRole([...STAFF]);
  const db = createAdminClient();
  const { data: rows } = await db.rpc("campaign_recipient_journey", { p_campaign: id });
  if (rows?.length) {
    type J = { email: string; name: string | null; is_contact: boolean; status: string; opened_at: string | null; clicked_at: string | null; opens: number; clicks: number;
      signed_up_at: string | null; sample_at: string | null; bought_at: string | null; revenue_minor: number; currency: string | null };
    return { frozen: true, people: (rows as J[]).map((r) => ({ ...r, type: r.is_contact ? "Contact" : "Student", revenue_minor: Number(r.revenue_minor) })) };
  }
  const { data: c } = await db.from("email_campaigns").select("kind, audience, include_contacts, exclude_buyers_of").eq("id", id).maybeSingle();
  if (!c) return { frozen: false, people: [] };
  return { frozen: false, people: await audienceList(c.kind === "promotion" ? "promotion" : "update", (c.audience ?? {}) as Audience, { include_contacts: Boolean(c.include_contacts), exclude_buyers_of: c.exclude_buyers_of }) };
}
