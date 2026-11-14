"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { setSetting } from "@/lib/site-settings";
import { sendEmail } from "@/lib/email/send";
import { AUTOMATION_DEFAULTS, getAutomations, loadCourse, render, runAutomations, varsFor, type AutomationSettings } from "@/lib/automations";
import { formatDate } from "@/lib/format";

const back = (k: "ok" | "err", msg: string): never => redirect(`/admin/marketing?tab=settings&${k}=${encodeURIComponent(msg)}`);
const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

async function audit(actor: string, action: string, data?: object) {
  await createAdminClient().from("audit_log").insert({ actor_id: actor, action, entity: "site_settings", entity_id: action.split(".")[0], data });
}

export async function saveTracking(form: FormData) {
  const admin = await requireRole(["admin"]);
  const id = (k: string) => str(form, k).replace(/\D/g, "") || null;
  const value = {
    linkedin_partner_id: id("linkedin_partner_id"),
    linkedin_signup_conversion_id: id("linkedin_signup_conversion_id"),
    linkedin_purchase_conversion_id: id("linkedin_purchase_conversion_id"),
  };
  await setSetting("tracking", value, admin.id);
  await audit(admin.id, "tracking.settings", value);
  revalidatePath("/", "layout");
  back("ok", value.linkedin_partner_id ? "LinkedIn tracking saved. It loads for visitors who accept cookies." : "LinkedIn tracking is off.");
}

const copy = (f: FormData, p: string) => ({ subject: str(f, `${p}_subject`).slice(0, 200), body: str(f, `${p}_body`).slice(0, 6000), cta: str(f, `${p}_cta`).slice(0, 60) || "Open" });

export async function saveAutomations(form: FormData) {
  const admin = await requireRole(["admin"]);
  const n = (k: string, def: number) => { const v = Number(str(form, k)); return Number.isFinite(v) && v > 0 ? Math.round(v) : def; };
  const deadline = str(form, "offer_deadline");
  if (deadline && !/^\d{4}-\d{2}-\d{2}$/.test(deadline)) back("err", "Use a valid offer end date.");
  const daysBefore = str(form, "offer_days_before").split(/[,\s]+/).map(Number).filter((x) => Number.isInteger(x) && x > 0 && x <= 60);
  const steps = [0, 1, 2].map((k) => ({ days: n(`w${k}_days`, 0), ...copy(form, `w${k}`) })).filter((s) => s.days > 0 && s.subject && s.body);

  const value: AutomationSettings = {
    course_id: str(form, "course_id") || null,
    abandoned: { enabled: form.get("abandoned_enabled") === "on", after_hours: n("abandoned_after_hours", 24),
      opted_in_only: form.get("abandoned_opted_in_only") === "on", ...copy(form, "abandoned") },
    offer: { enabled: form.get("offer_enabled") === "on", deadline: deadline ? new Date(`${deadline}T23:59:59Z`).toISOString() : null,
      days_before: daysBefore.length ? [...new Set(daysBefore)].sort((a, b) => b - a) : AUTOMATION_DEFAULTS.offer.days_before, ...copy(form, "offer") },
    welcome: { enabled: form.get("welcome_enabled") === "on", steps: steps.length ? steps : AUTOMATION_DEFAULTS.welcome.steps },
  };
  for (const c of [value.abandoned, value.offer, ...value.welcome.steps]) if (!c.subject || !c.body) back("err", "Every email needs a subject and a message.");
  if ((value.offer.enabled || value.welcome.enabled) && !value.course_id) back("err", "Choose the course these emails promote.");
  if (value.offer.enabled && !value.offer.deadline) back("err", "Set the date the offer ends.");
  await setSetting("automations", value, admin.id);
  await audit(admin.id, "automations.settings", { abandoned: value.abandoned.enabled, offer: value.offer.enabled, welcome: value.welcome.enabled });
  revalidatePath("/admin/marketing");
  back("ok", "Automatic emails saved.");
}

/** Send one automatic email to yourself, filled in with your name and today's offers. */
export async function sendAutomationTest(kind: string) {
  const admin = await requireRole(["admin"]);
  const s = await getAutomations();
  const course = await loadCourse(s.course_id);
  const deadline = s.offer.deadline ? formatDate(s.offer.deadline, "long") : "(offer end date)";
  const vars = await varsFor(course, admin.fullName, { deadline, days_left: "3 days" });
  const m = /^welcome_(\d)$/.exec(kind);
  const c = kind === "abandoned" ? s.abandoned : kind === "offer" ? s.offer : m ? s.welcome.steps[Number(m[1])] : null;
  if (!c || !admin.email) back("err", "Nothing to send.");
  const e = render(c!, vars, kind === "abandoned" ? vars.checkout_link : vars.course_link, admin.id);
  await sendEmail({ ...e, subject: `[Test] ${e.subject}`, to: admin.email!, template: "auto_test", ref: `${admin.id}:${kind}:${Date.now()}` });
  back("ok", `Test sent to ${admin.email}.`);
}

/** Run the daily job now (it also runs automatically every morning). */
export async function runAutomationsNow() {
  const admin = await requireRole(["admin"]);
  const r = await runAutomations();
  await audit(admin.id, "automations.run", r);
  revalidatePath("/admin/marketing");
  back("ok", `Sent: ${r.abandoned} checkout reminders, ${r.offer} offer reminders, ${r.welcome} welcome emails.`);
}

/** "About FinCoursa": the profile the marketing assistant reads first. Empty = back to the default. */
export async function saveMarketingProfile(form: FormData) {
  const admin = await requireRole(["admin"]);
  const text = str(form, "profile").slice(0, 12000);
  await setSetting("marketing_profile", { text }, admin.id);
  await audit(admin.id, "marketing_profile.saved", { length: text.length });
  revalidatePath("/admin/marketing");
  redirect(`/admin/marketing?tab=about&ok=${encodeURIComponent(text ? "Saved. The assistant will use this from now on." : "Back to the default profile.")}`);
}

/** Tick or untick a Getting started step. */
export async function toggleChecklist(step: string, done: boolean) {
  const admin = await requireRole(["admin"]);
  const { getSetting } = await import("@/lib/site-settings");
  const cur = (await getSetting<{ done?: string[] }>("marketing_checklist"))?.done ?? [];
  const next = done ? [...new Set([...cur, step])] : cur.filter((s) => s !== step);
  await setSetting("marketing_checklist", { done: next }, admin.id);
  revalidatePath("/admin/marketing");
}

/** Mark a saved draft as used, or archive it (hidden from the list). */
export async function setDraftStatus(id: string, status: "draft" | "used" | "archived") {
  await requireRole(["admin"]);
  await createAdminClient().from("marketing_drafts").update({ status, updated_at: new Date().toISOString() }).eq("id", id);
  revalidatePath("/admin/marketing");
}
