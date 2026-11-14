import "server-only";
import { randomBytes } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSetting } from "@/lib/site-settings";
import { env } from "@/lib/env";
import { formatMoney } from "@/lib/money";
import { sendEmail } from "@/lib/email/send";
import { automationEmail } from "@/lib/email/templates";

/**
 * Growth hub (Admin → Marketing). Institution leads come in from the "For Institutions" form, the contact form,
 * or automatically when several people from one organisation sign up. Each lead gets an instant thank-you,
 * a proposal page with a quote, and follow-ups. Everything except the thank-you waits in the approvals outbox.
 */

export type GrowthCopy = { subject: string; body: string };
export type GrowthSettings = {
  /** where new-lead alerts go, and where replies from leads land */
  team_email: string;
  /** optional meeting link (Calendly, Google, Zoom…) */
  booking_url: string;
  /** team price per person, per course, in minor units, by currency */
  seat_price: Record<string, number>;
  /** volume discounts: at least `seats` people → `pct` off */
  tiers: { seats: number; pct: number }[];
  pilot_seats: number;
  pilot_days: number;
  proposal_valid_days: number;
  /** people from one organisation (same work email domain) before it shows as an opportunity */
  domain_threshold: number;
  ack: GrowthCopy;
  proposal: GrowthCopy;
  /** follow-ups after the proposal was sent, in days */
  follow_ups: (GrowthCopy & { days: number })[];
};

export const GROWTH_DEFAULTS: GrowthSettings = {
  team_email: "team@fincoursa.com",
  booking_url: "",
  seat_price: { USD: 9900, INR: 800000 },
  tiers: [{ seats: 10, pct: 10 }, { seats: 25, pct: 15 }, { seats: 50, pct: 20 }],
  pilot_seats: 5,
  pilot_days: 30,
  proposal_valid_days: 30,
  domain_threshold: 3,
  ack: {
    subject: "Thank you for your enquiry, {first_name}",
    body: "Hi {first_name},\n\nThank you for your interest in FinCoursa for {organization}. We have your enquiry and will send you a proposal within one working day.\n\n{booking_line}\n\nIn the meantime, you can see our programmes for teams here: {institutions_link}",
  },
  proposal: {
    subject: "FinCoursa proposal for {organization}",
    body: "Hi {first_name},\n\nThank you for your time. Your proposal for {organization} is ready. It covers the courses you asked about, pricing for your team, and a free pilot so a few of your people can try FinCoursa before you decide:\n\n- {pilot_seats} people, full access, for {pilot_days} days, at no cost\n\nYou can open the proposal, request the pilot or accept it from the link below.\n\n{booking_line}",
  },
  follow_ups: [
    {
      days: 5, subject: "Any questions about the FinCoursa proposal?",
      body: "Hi {first_name},\n\nI wanted to check whether you had a chance to look at the proposal for {organization}, and whether any questions came up.\n\nMany teams start with the free pilot: {pilot_seats} people, {pilot_days} days, no cost. You can request it from the proposal page.\n\n{booking_line}",
    },
    {
      days: 12, subject: "Shall we set up a free pilot for {organization}?",
      body: "Hi {first_name},\n\nA quick last note on the proposal. If the timing isn't right, just let me know and I'll follow up later. If it is, the easiest next step is a free {pilot_days}-day pilot for {pilot_seats} people on your team.\n\n{booking_line}",
    },
  ],
};

export async function getGrowthSettings(): Promise<GrowthSettings> {
  const s = (await getSetting<Partial<GrowthSettings>>("growth")) ?? {};
  return { ...GROWTH_DEFAULTS, ...s, ack: { ...GROWTH_DEFAULTS.ack, ...(s.ack ?? {}) }, proposal: { ...GROWTH_DEFAULTS.proposal, ...(s.proposal ?? {}) } };
}

export const ORG_TYPES: [string, string][] = [
  ["bank", "Bank"], ["broker", "Broker or trading firm"], ["asset_manager", "Asset or wealth manager"], ["insurance", "Insurance"],
  ["fintech", "Fintech"], ["university", "University or business school"], ["training", "Training or professional body"],
  ["corporate", "Other company"], ["other", "Other"],
];
export const STAGES: [string, string][] = [
  ["new", "New"], ["contacted", "Contacted"], ["proposal", "Proposal sent"], ["pilot", "Pilot"], ["won", "Won"], ["lost", "Lost"],
];

const site = () => env.siteUrl.replace(/\/$/, "");
export const proposalUrl = (token: string) => `${site()}/proposals/${token}`;
const firstName = (n?: string | null) => n?.trim().split(/\s+/)[0] || "there";

/** Personal and free email providers: never treated as an organisation. */
const FREE_DOMAINS = new Set(["gmail.com", "googlemail.com", "yahoo.com", "yahoo.co.in", "yahoo.co.uk", "outlook.com", "hotmail.com", "live.com",
  "msn.com", "icloud.com", "me.com", "aol.com", "proton.me", "protonmail.com", "gmx.com", "gmx.de", "zoho.com", "yandex.com", "mail.com",
  "rediffmail.com", "qq.com", "163.com", "web.de", "hey.com", "fastmail.com"]);
export const workDomain = (email?: string | null) => {
  const d = email?.split("@")[1]?.toLowerCase().trim();
  return d && !FREE_DOMAINS.has(d) ? d : null;
};

/** The quote for a lead: seats × per-seat price × courses, less the volume discount. */
export function quote(s: GrowthSettings, seats: number, courses: number, country: string | null) {
  const currency = country === "IN" && s.seat_price.INR ? "INR" : "USD";
  const per = s.seat_price[currency] ?? s.seat_price.USD ?? 0;
  const pct = [...s.tiers].sort((a, b) => b.seats - a.seats).find((t) => seats >= t.seats)?.pct ?? 0;
  const gross = per * seats * Math.max(1, courses);
  return { currency, seat_price_minor: per, discount_pct: pct, value_minor: Math.round(gross * (1 - pct / 100)), gross_minor: gross };
}

type Lead = {
  id: string; organization: string; contact_name: string | null; email: string | null; country: string | null; team_size: number | null;
  course_ids: string[]; seats: number | null; currency: string | null; value_minor: number | null; proposal_token: string | null;
};

function fill(t: string, lead: Lead, s: GrowthSettings) {
  const vars: Record<string, string> = {
    first_name: firstName(lead.contact_name), organization: lead.organization,
    pilot_seats: String(s.pilot_seats), pilot_days: String(s.pilot_days),
    booking_line: s.booking_url ? `If it's easier to talk it through, book a short call here: ${s.booking_url}` : "",
    institutions_link: `${site()}/pages/institutions`,
    proposal_link: lead.proposal_token ? proposalUrl(lead.proposal_token) : "",
  };
  return t.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m)).split(/\n{2,}/).map((p) => p.trim()).filter(Boolean).join("\n\n");
}

export async function logEvent(leadId: string, kind: string, body: string, by?: string | null) {
  await createAdminClient().from("lead_events").insert({ lead_id: leadId, kind, body, created_by: by ?? null });
}

/** Draft an email into the approvals outbox (once per lead and step). */
async function draft(lead: Lead, kind: "proposal" | "follow_up", step: number, copy: GrowthCopy, reason: string, s: GrowthSettings) {
  if (!lead.email) return false;
  const { error } = await createAdminClient().from("outbox").insert({
    lead_id: lead.id, kind, step, to_email: lead.email, to_name: lead.contact_name,
    subject: fill(copy.subject, lead, s), body: fill(copy.body, lead, s),
    cta_label: lead.proposal_token ? "View your proposal" : null, cta_url: lead.proposal_token ? proposalUrl(lead.proposal_token) : null,
    reason,
  });
  return !error;
}

export type Enquiry = {
  organization: string; org_type?: string; country?: string | null; contact_name: string; email: string; role?: string;
  team_size?: number | null; course_ids?: string[]; message?: string;
  /** campaign that brought them (lib/attribution) */
  campaign_id?: string | null; touch?: unknown;
};

/** A new enquiry: create the lead, send the thank-you now, alert the team, and draft the proposal for approval. */
export async function createLeadFromEnquiry(e: Enquiry) {
  const s = await getGrowthSettings();
  const db = createAdminClient();
  const seats = e.team_size && e.team_size > 0 ? Math.min(e.team_size, 100000) : 10;
  const q = quote(s, seats, e.course_ids?.length ?? 1, e.country ?? null);
  const { data: lead, error } = await db.from("institution_leads").insert({
    organization: e.organization, org_type: e.org_type ?? "other", country: e.country ?? null, contact_name: e.contact_name,
    email: e.email, role: e.role ?? null, team_size: e.team_size ?? null, course_ids: e.course_ids ?? [], message: e.message ?? null,
    source: "enquiry", email_domain: workDomain(e.email), seats, currency: q.currency, seat_price_minor: q.seat_price_minor,
    discount_pct: q.discount_pct, value_minor: q.value_minor, proposal_token: randomBytes(18).toString("base64url"),
    campaign_id: e.campaign_id ?? null, touch: e.touch ?? null,
  }).select("id, organization, contact_name, email, country, team_size, course_ids, seats, currency, value_minor, proposal_token").single();
  if (error || !lead) throw new Error(error?.message ?? "could not save the enquiry");
  await logEvent(lead.id, "created", `Enquiry from ${e.contact_name}${e.role ? ` (${e.role})` : ""}${e.message ? `: "${e.message.slice(0, 500)}"` : ""}`);

  // instant thank-you (a direct reply to their own request, not marketing)
  const ack = automationEmail({ subject: fill(s.ack.subject, lead, s), body: fill(s.ack.body, lead, s), cta: { label: "See programmes for teams", url: `${site()}/pages/institutions` } });
  await sendEmail({ ...ack, to: e.email, template: "growth_ack", ref: lead.id, replyTo: s.team_email });
  await logEvent(lead.id, "email", `Thank-you email sent to ${e.email}`);

  // alert the team
  const alert = automationEmail({
    subject: `New institution enquiry: ${e.organization}`,
    body: `${e.contact_name}${e.role ? `, ${e.role}` : ""} at ${e.organization}${e.country ? ` (${e.country})` : ""} asked about FinCoursa for ${e.team_size ? `${e.team_size} people` : "their team"}.\n\nEstimated value: ${formatMoney(q.value_minor, q.currency)}\n\nA proposal email is waiting for your approval.`,
    cta: { label: "Open in Admin", url: `${site()}/admin/marketing/leads/${lead.id}` },
  });
  await sendEmail({ ...alert, to: s.team_email, template: "growth_alert", ref: lead.id });

  await draft(lead, "proposal", 1, s.proposal, "New enquiry: send the proposal", s);
  return lead.id;
}

/** Daily: spot organisations from sign-ups, and draft follow-ups for proposals with no reply. */
export async function runGrowth(now = new Date()) {
  const s = await getGrowthSettings();
  const db = createAdminClient();
  const out = { opportunities: 0, follow_ups: 0 };

  // several people from one organisation signed up on their own: a team opportunity
  const { fetchAll } = await import("@/lib/marketing-metrics");
  const people = await fetchAll<{ email: string | null; full_name: string | null }>((a, b) => db.from("profiles").select("email, full_name").not("email", "is", null).order("id").range(a, b));
  const byDomain = new Map<string, string[]>();
  for (const p of people) {
    const d = workDomain(p.email);
    if (d) byDomain.set(d, [...(byDomain.get(d) ?? []), p.full_name || p.email!]);
  }
  const { data: known } = await db.from("institution_leads").select("email_domain").not("email_domain", "is", null);
  const seen = new Set((known ?? []).map((k) => String(k.email_domain).toLowerCase()));
  for (const [domain, names] of byDomain) {
    if (names.length < s.domain_threshold || seen.has(domain)) continue;
    const q = quote(s, names.length * 3, 1, null);
    const { data: lead } = await db.from("institution_leads").insert({
      organization: domain, source: "domain", email_domain: domain, team_size: names.length, seats: names.length * 3,
      currency: q.currency, seat_price_minor: q.seat_price_minor, discount_pct: q.discount_pct, value_minor: q.value_minor,
      proposal_token: randomBytes(18).toString("base64url"),
      notes: `${names.length} people with @${domain} email addresses have signed up on their own: ${names.slice(0, 20).join(", ")}. Find the right contact (learning and development, the head of their team, or the person who signed up first) and offer a team licence.`,
    }).select("id").single();
    if (lead) { out.opportunities++; await logEvent(lead.id, "created", `Spotted automatically: ${names.length} sign-ups from @${domain}`); }
  }

  // follow-ups: proposal sent, still at "Proposal sent", and the day has come
  const { data: open } = await db.from("institution_leads")
    .select("id, organization, contact_name, email, country, team_size, course_ids, seats, currency, value_minor, proposal_token, proposal_sent_at")
    .eq("stage", "proposal").not("proposal_sent_at", "is", null);
  for (const lead of (open ?? []) as (Lead & { proposal_sent_at: string })[]) {
    for (const [i, f] of s.follow_ups.entries()) {
      if (now.getTime() - new Date(lead.proposal_sent_at).getTime() < f.days * 86400_000) continue;
      if (await draft(lead, "follow_up", i + 1, f, `No reply ${f.days} days after the proposal`, s)) out.follow_ups++;
    }
  }
  return out;
}

/** Send one approved outbox email and move the lead along. */
export async function sendOutbox(id: string, approverId: string) {
  const db = createAdminClient();
  const s = await getGrowthSettings();
  const { data: m } = await db.from("outbox").select("*").eq("id", id).maybeSingle();
  if (!m || m.status !== "pending") return { ok: false, error: "This email was already handled." };
  const e = automationEmail({ subject: m.subject, body: m.body, cta: { label: m.cta_label ?? "Visit FinCoursa", url: m.cta_url ?? site() } });
  const ok = await sendEmail({ ...e, to: m.to_email, template: "growth_outbox", ref: m.id, replyTo: s.team_email });
  const decided = { decided_by: approverId, decided_at: new Date().toISOString() };
  if (!ok) {
    await db.from("outbox").update({ status: "failed", error: "The email provider did not accept it", ...decided }).eq("id", id);
    return { ok: false, error: "The email could not be sent. Check the email settings and try again." };
  }
  await db.from("outbox").update({ status: "sent", ...decided }).eq("id", id);
  if (m.lead_id) {
    await logEvent(m.lead_id, "email", `Sent: "${m.subject}"`, approverId);
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (m.kind === "proposal") { patch.stage = "proposal"; patch.proposal_sent_at = new Date().toISOString(); }
    else if (m.kind === "manual") patch.stage = "contacted";
    await db.from("institution_leads").update(patch).eq("id", m.lead_id).in("stage", m.kind === "proposal" ? ["new", "contacted", "proposal"] : ["new"]);
  }
  return { ok: true };
}
