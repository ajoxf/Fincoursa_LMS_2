import "server-only";
import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSetting } from "@/lib/site-settings";
import { env } from "@/lib/env";
import { formatDate } from "@/lib/format";
import { sendEmail } from "@/lib/email/send";
import { automationEmail } from "@/lib/email/templates";
import { unsubscribeUrl } from "@/lib/email/unsubscribe";
import { cashbackLabel, cashbackRule, getCashbackSettings } from "@/lib/cashback";
import { foundingLabel, getFoundingSettings, joiningOpen } from "@/lib/founding";

/**
 * Automatic marketing emails (Admin → Marketing). Run once a day by the cron job, or on demand from the admin.
 * Every email is logged under (template, ref), so nobody gets the same one twice.
 *
 * Placeholders in subjects and bodies: {first_name} {course} {course_link} {checkout_link} {deadline} {days_left}
 * {offer_lines} (one line per live offer: cashback, founding members). A paragraph whose lines start with "- " is a list.
 */
export type EmailCopy = { subject: string; body: string; cta: string };
export type AutomationSettings = {
  /** the course these emails promote (offer and welcome emails) */
  course_id: string | null;
  abandoned: EmailCopy & { enabled: boolean; after_hours: number; opted_in_only: boolean };
  offer: EmailCopy & { enabled: boolean; deadline: string | null; days_before: number[] };
  welcome: { enabled: boolean; steps: (EmailCopy & { days: number })[] };
};

export const AUTOMATION_DEFAULTS: AutomationSettings = {
  course_id: null,
  abandoned: {
    enabled: false, after_hours: 24, opted_in_only: false,
    subject: "You left {course} at checkout",
    body: "Hi {first_name},\n\nYou started enrolling in {course} but didn't finish. It only takes a minute to complete, and your details are saved.\n\n{offer_lines}\n\nIf something went wrong with the payment, or you have a question about the course, just reply to this email.",
    cta: "Complete my enrolment",
  },
  offer: {
    enabled: false, deadline: null, days_before: [3, 1],
    subject: "{days_left} left: launch offer on {course}",
    body: "Hi {first_name},\n\nOur launch offer on {course} closes on {deadline}. Enrol before then to get:\n\n{offer_lines}\n\nAfter {deadline}, these benefits won't be available.",
    cta: "See the course",
  },
  welcome: {
    enabled: false,
    steps: [
      {
        days: 1, subject: "Welcome to FinCoursa",
        body: "Hi {first_name},\n\nThanks for joining FinCoursa. We build focused, practical preparation for finance and trading professionals.\n\nOur first release is {course}: practice questions with a clear explanation for every answer, in practice or exam mode.\n\n{offer_lines}\n\nAny questions? Just reply to this email.",
        cta: "Explore the course",
      },
      {
        days: 4, subject: "How to get the most from {course}",
        body: "Hi {first_name},\n\nA simple way to prepare with {course}:\n\n- Start each topic in practice mode and read every explanation\n- Retake it in exam mode until you score well\n- Finish with the chart questions to test your chart reading\n\n{offer_lines}\n\nReply to this email if you'd like help with any question.",
        cta: "Start preparing",
      },
    ],
  },
};

export const getAutomations = cache(async (): Promise<AutomationSettings> => {
  const s = (await getSetting<Partial<AutomationSettings>>("automations")) ?? {};
  return {
    ...AUTOMATION_DEFAULTS, ...s,
    abandoned: { ...AUTOMATION_DEFAULTS.abandoned, ...(s.abandoned ?? {}) },
    offer: { ...AUTOMATION_DEFAULTS.offer, ...(s.offer ?? {}) },
    welcome: { ...AUTOMATION_DEFAULTS.welcome, ...(s.welcome ?? {}) },
  };
});

type Course = { id: string; slug: string; title: string; cashback_mode: string | null; cashback_percent: number | null; cashback_fixed: Record<string, number> | null; prices: { currency: string; is_active: boolean }[] };

async function loadCourse(id: string | null): Promise<Course | null> {
  if (!id) return null;
  const { data } = await createAdminClient().from("courses")
    .select("id, slug, title, cashback_mode, cashback_percent, cashback_fixed, prices(currency, is_active)").eq("id", id).maybeSingle();
  return (data as Course | null) ?? null;
}

/** One line per offer that is live right now for this course (empty when none). */
async function offerLines(course: Course | null): Promise<string> {
  if (!course) return "";
  const [cb, fs] = await Promise.all([getCashbackSettings(), getFoundingSettings()]);
  const currency = course.prices.find((p) => p.is_active)?.currency ?? env.defaultCurrency;
  const lines: string[] = [];
  const rule = cashbackRule(cb, { mode: course.cashback_mode as never, percent: course.cashback_percent, fixed: course.cashback_fixed });
  const cbl = cashbackLabel(rule, currency);
  if (cbl) lines.push(`- ${cbl === "100%" ? "Your full course fee" : `${cbl} of your course fee`} back as credit for future FinCoursa courses`);
  const fl = foundingLabel(fs, currency);
  if (fl && joiningOpen(fs) && fs.qualifying_course_ids.includes(course.id)) {
    lines.push(`- Founding member: ${fl} off every future course${fs.benefit_ends_at ? ` until ${formatDate(fs.benefit_ends_at)}` : ", for life"}${fs.cap ? ` (first ${fs.cap} members)` : ""}`);
  }
  return lines.join("\n");
}

const site = () => env.siteUrl.replace(/\/$/, "");
const firstName = (n?: string | null) => n?.trim().split(/\s+/)[0] || "there";

function fill(t: string, v: Record<string, string>) {
  return t.replace(/\{(\w+)\}/g, (m, k) => (k in v ? v[k] : m));
}

export function render(copy: EmailCopy, vars: Record<string, string>, ctaUrl: string, userId: string | null) {
  const subject = fill(copy.subject, vars).replace(/\s+/g, " ").trim();
  // drop paragraphs that end up empty (e.g. {offer_lines} with no live offer)
  const body = fill(copy.body, vars).split(/\n{2,}/).map((p) => p.trim()).filter(Boolean).join("\n\n");
  return automationEmail({ subject, body, cta: { label: fill(copy.cta, vars), url: ctaUrl }, unsubscribeUrl: userId ? unsubscribeUrl(userId) : undefined });
}

export async function varsFor(course: Course | null, name: string | null, extra: Record<string, string> = {}) {
  return {
    first_name: firstName(name),
    course: course?.title ?? "our courses",
    course_link: course ? `${site()}/courses/${course.slug}` : `${site()}/pages/paid-courses`,
    checkout_link: course ? `${site()}/checkout?course=${course.slug}` : `${site()}/pages/paid-courses`,
    offer_lines: await offerLines(course),
    deadline: "", days_left: "",
    ...extra,
  };
}

const HOUR = 3600_000, DAY = 24 * HOUR;
const MAX_PER_RUN = 400;

/** Run every automatic email that is due. Returns how many were sent per kind. */
export async function runAutomations(now = new Date()) {
  const s = await getAutomations();
  const db = createAdminClient();
  const course = await loadCourse(s.course_id);
  const out = { abandoned: 0, offer: 0, welcome: 0 };

  // ---- abandoned checkout: an unpaid order, after_hours old, with nothing bought since ----
  if (s.abandoned.enabled) {
    const until = new Date(now.getTime() - s.abandoned.after_hours * HOUR).toISOString();
    const since = new Date(now.getTime() - (s.abandoned.after_hours + 72) * HOUR).toISOString(); // catch up for 3 days
    const { data: orders } = await db.from("orders")
      .select("id, user_id, created_at, profile:profiles(email, full_name, marketing_opt_in), order_items(course_id, bundle_id, course:courses(id, slug, title, cashback_mode, cashback_percent, cashback_fixed, prices(currency, is_active)))")
      .in("status", ["pending", "failed"]).gte("created_at", since).lte("created_at", until).limit(MAX_PER_RUN);
    for (const o of (orders ?? []) as unknown as {
      id: string; user_id: string; created_at: string; profile: { email: string | null; full_name: string | null; marketing_opt_in: boolean } | null;
      order_items: { course_id: string | null; bundle_id: string | null; course: Course | null }[];
    }[]) {
      const item = o.order_items?.[0];
      if (!o.profile?.email || !item?.course || (s.abandoned.opted_in_only && !o.profile.marketing_opt_in)) continue;
      // bought it since, or already has access? then no reminder
      const [{ count: paid }, { count: enrolled }] = await Promise.all([
        db.from("orders").select("id, order_items!inner(course_id)", { count: "exact", head: true })
          .eq("user_id", o.user_id).eq("status", "paid").eq("order_items.course_id", item.course.id),
        db.from("enrollments").select("id", { count: "exact", head: true }).eq("user_id", o.user_id).eq("course_id", item.course.id).is("revoked_at", null),
      ]);
      if ((paid ?? 0) > 0 || (enrolled ?? 0) > 0) continue;
      const vars = await varsFor(item.course, o.profile.full_name);
      const e = render(s.abandoned, vars, vars.checkout_link, o.user_id);
      // one reminder per person per course, however many times they started checkout
      if (await sendEmail({ ...e, to: o.profile.email, template: "auto_abandoned", ref: `${o.user_id}:${item.course.id}` })) out.abandoned++;
    }
  }

  // ---- offer closing: N days before the deadline, to opted-in people who haven't bought ----
  if (s.offer.enabled && s.offer.deadline && course) {
    const deadline = new Date(s.offer.deadline);
    const daysLeft = Math.ceil((deadline.getTime() - now.getTime()) / DAY);
    if (daysLeft > 0 && s.offer.days_before.includes(daysLeft)) {
      const { data: people } = await db.from("profiles").select("id, email, full_name").eq("marketing_opt_in", true).not("email", "is", null).limit(5000);
      const { data: owners } = await db.from("enrollments").select("user_id").eq("course_id", course.id).is("revoked_at", null);
      const owned = new Set((owners ?? []).map((r) => r.user_id));
      const base = await varsFor(course, null, { deadline: formatDate(deadline.toISOString(), "long"), days_left: `${daysLeft} day${daysLeft === 1 ? "" : "s"}` });
      for (const p of (people ?? []).filter((x) => !owned.has(x.id)).slice(0, MAX_PER_RUN)) {
        const e = render(s.offer, { ...base, first_name: firstName(p.full_name) }, base.course_link, p.id);
        if (await sendEmail({ ...e, to: p.email!, template: "auto_offer", ref: `${p.id}:${s.offer.deadline.slice(0, 10)}:${daysLeft}` })) out.offer++;
      }
    }
  }

  // ---- welcome sequence: day N after sign-up, opted-in, nothing bought yet ----
  if (s.welcome.enabled) {
    for (const [k, step] of s.welcome.steps.entries()) {
      const until = new Date(now.getTime() - step.days * DAY).toISOString();
      const since = new Date(now.getTime() - (step.days + 3) * DAY).toISOString();
      const { data: people } = await db.from("profiles").select("id, email, full_name")
        .eq("marketing_opt_in", true).gte("created_at", since).lte("created_at", until).not("email", "is", null).limit(MAX_PER_RUN);
      for (const p of people ?? []) {
        const { count } = await db.from("orders").select("id", { count: "exact", head: true }).eq("user_id", p.id).eq("status", "paid");
        if ((count ?? 0) > 0) continue;
        const vars = await varsFor(course, p.full_name);
        const e = render(step, vars, vars.course_link, p.id);
        if (await sendEmail({ ...e, to: p.email!, template: `auto_welcome_${k + 1}`, ref: p.id })) out.welcome++;
      }
    }
  }
  return out;
}

export { loadCourse };
