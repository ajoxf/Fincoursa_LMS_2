"use server";
import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { setSetting } from "@/lib/site-settings";
import { minorUnitsFactor } from "@/lib/money";
import { GROWTH_DEFAULTS, getGrowthSettings, logEvent, ORG_TYPES, quote, runGrowth, sendOutbox, STAGES, workDomain, type GrowthSettings } from "@/lib/growth";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const go = (path: string, k: "ok" | "err", msg: string): never => redirect(`${path}${path.includes("?") ? "&" : "?"}${k}=${encodeURIComponent(msg)}`);
const staff = () => requireRole(["admin", "support", "finance"]);

/** Approve an email in the outbox (after any edits) and send it now. */
export async function approveOutbox(id: string, back: string, form: FormData) {
  const me = await staff();
  const subject = str(form, "subject").slice(0, 300), body = str(form, "body").slice(0, 10000);
  if (!subject || !body) go(back, "err", "The email needs a subject and a message.");
  await createAdminClient().from("outbox").update({ subject, body }).eq("id", id).eq("status", "pending");
  const r = await sendOutbox(id, me.id);
  revalidatePath("/admin/marketing");
  go(back, r.ok ? "ok" : "err", r.ok ? "Sent." : r.error ?? "Could not send.");
}

export async function rejectOutbox(id: string, back: string) {
  const me = await staff();
  const db = createAdminClient();
  const { data } = await db.from("outbox").update({ status: "rejected", decided_by: me.id, decided_at: new Date().toISOString() })
    .eq("id", id).eq("status", "pending").select("lead_id, subject").maybeSingle();
  if (data?.lead_id) await logEvent(data.lead_id, "skipped", `Not sent: "${data.subject}"`, me.id);
  revalidatePath("/admin/marketing");
  go(back, "ok", "Removed. It won't be sent.");
}

/** Edit a lead: stage, contact, team size and quote, notes. */
export async function updateLead(id: string, form: FormData) {
  const me = await staff();
  const db = createAdminClient();
  const back = `/admin/marketing/leads/${id}`;
  const { data: cur } = await db.from("institution_leads").select("stage, country, course_ids").eq("id", id).maybeSingle();
  if (!cur) go("/admin/marketing?tab=institutions", "err", "That lead no longer exists.");
  const stage = str(form, "stage");
  const seats = Math.round(Number(str(form, "seats")) || 0);
  const country = str(form, "country").toUpperCase().slice(0, 2) || null;
  const patch: Record<string, unknown> = {
    organization: str(form, "organization") || undefined, contact_name: str(form, "contact_name") || null,
    email: str(form, "email") || null, role: str(form, "role") || null, country,
    org_type: ORG_TYPES.some(([v]) => v === str(form, "org_type")) ? str(form, "org_type") : undefined,
    notes: str(form, "notes").slice(0, 10000) || null, updated_at: new Date().toISOString(),
  };
  if (STAGES.some(([v]) => v === stage)) patch.stage = stage;
  const email = patch.email as string | null;
  if (email) patch.email_domain = workDomain(email);
  if (seats > 0) {
    const s = await getGrowthSettings();
    const q = quote(s, seats, cur!.course_ids?.length ?? 1, country);
    const price = Number(str(form, "seat_price"));
    const per = price > 0 ? Math.round(price * minorUnitsFactor(q.currency)) : q.seat_price_minor;
    const pct = str(form, "discount_pct") === "" ? q.discount_pct : Math.max(0, Math.min(90, Number(str(form, "discount_pct")) || 0));
    Object.assign(patch, { seats, currency: q.currency, seat_price_minor: per, discount_pct: pct,
      value_minor: Math.round(per * seats * Math.max(1, cur!.course_ids?.length ?? 1) * (1 - pct / 100)) });
  }
  const { error } = await db.from("institution_leads").update(patch).eq("id", id);
  if (error) go(back, "err", error.message);
  if (patch.stage && patch.stage !== cur!.stage) await logEvent(id, "stage", `Stage: ${STAGES.find(([v]) => v === patch.stage)?.[1]}`, me.id);
  revalidatePath("/admin/marketing");
  go(back, "ok", "Saved.");
}

export async function addLeadNote(id: string, form: FormData) {
  const me = await staff();
  const text = str(form, "note").slice(0, 4000);
  if (text) await logEvent(id, "note", text, me.id);
  revalidatePath(`/admin/marketing/leads/${id}`);
  go(`/admin/marketing/leads/${id}`, "ok", "Note added.");
}

/** Write an email to a lead; it goes to the approvals list (or is sent now with "Send now"). */
export async function writeLeadEmail(id: string, form: FormData) {
  const me = await staff();
  const db = createAdminClient();
  const back = `/admin/marketing/leads/${id}`;
  const { data: lead } = await db.from("institution_leads").select("email, contact_name, proposal_token").eq("id", id).maybeSingle();
  if (!lead?.email) go(back, "err", "Add the contact's email first.");
  const subject = str(form, "subject"), body = str(form, "body");
  if (!subject || !body) go(back, "err", "The email needs a subject and a message.");
  const withProposal = form.get("with_proposal") === "on" && lead!.proposal_token;
  const { data: m } = await db.from("outbox").insert({
    lead_id: id, kind: "manual", to_email: lead!.email, to_name: lead!.contact_name, subject, body, reason: "Written by staff",
    cta_label: withProposal ? "View your proposal" : null,
    cta_url: withProposal ? `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/proposals/${lead!.proposal_token}` : null,
  }).select("id").single();
  if (form.get("send_now") === "on" && m) {
    const r = await sendOutbox(m.id, me.id);
    revalidatePath("/admin/marketing");
    go(back, r.ok ? "ok" : "err", r.ok ? "Sent." : r.error ?? "Could not send.");
  }
  revalidatePath("/admin/marketing");
  go(back, "ok", "Saved to Approvals.");
}

/** Add an organisation by hand (e.g. met at an event). */
export async function addLead(form: FormData) {
  await staff();
  const organization = str(form, "organization");
  if (!organization) go("/admin/marketing?tab=institutions", "err", "Enter the organisation's name.");
  const s = await getGrowthSettings();
  const seats = Math.round(Number(str(form, "team_size")) || 10);
  const country = str(form, "country").toUpperCase().slice(0, 2) || null;
  const q = quote(s, seats, 1, country);
  const email = str(form, "email") || null;
  const { data, error } = await createAdminClient().from("institution_leads").insert({
    organization, org_type: ORG_TYPES.some(([v]) => v === str(form, "org_type")) ? str(form, "org_type") : "other",
    contact_name: str(form, "contact_name") || null, email, email_domain: workDomain(email), country, source: "manual",
    team_size: seats, seats, currency: q.currency, seat_price_minor: q.seat_price_minor, discount_pct: q.discount_pct, value_minor: q.value_minor,
    proposal_token: randomBytes(18).toString("base64url"),
  }).select("id").single();
  if (error || !data) go("/admin/marketing?tab=institutions", "err", error?.message ?? "Could not add it.");
  await logEvent(data!.id, "created", "Added by staff");
  revalidatePath("/admin/marketing");
  redirect(`/admin/marketing/leads/${data!.id}`);
}

/** Run the daily checks now: new organisation opportunities and due follow-ups. */
export async function runGrowthNow() {
  await requireRole(["admin"]);
  const r = await runGrowth();
  revalidatePath("/admin/marketing");
  go("/admin/marketing?tab=approvals", "ok", `Checked: ${r.opportunities} new organisation opportunities, ${r.follow_ups} follow-ups drafted.`);
}

export async function saveGrowthSettings(form: FormData) {
  const admin = await requireRole(["admin"]);
  const back = "/admin/marketing?tab=settings";
  const num = (k: string, d: number) => { const v = Number(str(form, k)); return Number.isFinite(v) && v > 0 ? v : d; };
  const copy = (p: string, d: { subject: string; body: string }) => ({ subject: str(form, `${p}_subject`) || d.subject, body: str(form, `${p}_body`) || d.body });
  const tiers = [0, 1, 2].map((i) => ({ seats: Math.round(num(`tier${i}_seats`, 0)), pct: num(`tier${i}_pct`, 0) })).filter((t) => t.seats > 0 && t.pct > 0 && t.pct < 90);
  const value: GrowthSettings = {
    team_email: str(form, "team_email") || GROWTH_DEFAULTS.team_email,
    booking_url: /^https:\/\//.test(str(form, "booking_url")) ? str(form, "booking_url") : "",
    seat_price: { USD: Math.round(num("price_usd", 99) * 100), INR: Math.round(num("price_inr", 8000) * 100) },
    tiers,
    pilot_seats: Math.round(num("pilot_seats", 5)), pilot_days: Math.round(num("pilot_days", 30)),
    proposal_valid_days: Math.round(num("proposal_valid_days", 30)), domain_threshold: Math.max(2, Math.round(num("domain_threshold", 3))),
    ack: copy("ack", GROWTH_DEFAULTS.ack), proposal: copy("proposal", GROWTH_DEFAULTS.proposal),
    follow_ups: GROWTH_DEFAULTS.follow_ups.map((f, i) => ({ days: Math.round(num(`fu${i}_days`, f.days)), ...copy(`fu${i}`, f) })),
  };
  await setSetting("growth", value, admin.id);
  await createAdminClient().from("audit_log").insert({ actor_id: admin.id, action: "growth.settings", entity: "site_settings", entity_id: "growth" });
  revalidatePath("/admin/marketing");
  go(back, "ok", "Saved.");
}
