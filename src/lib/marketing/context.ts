import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSetting } from "@/lib/site-settings";
import { env } from "@/lib/env";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/format";
import { cashbackLabel, cashbackRule, getCashbackSettings } from "@/lib/cashback";
import { foundingLabel, getFoundingSettings, joiningOpen } from "@/lib/founding";

/**
 * "About FinCoursa": the marketing profile the assistant reads before every task (Admin → Marketing →
 * About FinCoursa). Live facts (prices, offers, numbers) are added from the database, not typed here.
 */
export const DEFAULT_PROFILE = `WHO WE ARE
FinCoursa (fincoursa.com) is an online learning platform for finance and trading professionals, operated by PRJ International, India. It builds focused, practical exam preparation and courses.

WHAT WE SELL NOW
CMT Level 2 - Question Bank: exam-style practice questions across the CMT Level II curriculum, plus chart-based questions, each with a clear explanation of why the right answer is right and why the others are wrong. Students choose Practice mode (check each answer as they go) or Exam mode (submit and get a score). Some units of the curriculum are not covered yet, so never claim it covers every unit.

WHO WE SELL TO
1. First: CMT (Chartered Market Technician) candidates preparing for the Level II exam, especially people who have passed Level I. Typical roles: technical analysts, research analysts, traders, portfolio and fund managers, wealth advisors, finance students. Main markets: India, UAE, UK, US, Singapore.
2. Next: actively trading professionals who want to sharpen technical analysis.

WHAT THEY CARE ABOUT
Passing the exam on the first attempt, studying efficiently around a full-time job, knowing which topics they are weak in, practising with questions that feel like the real exam, and understanding the "why" behind each answer.

HOW WE SOUND
Plain, professional and specific. Calm and credible, like a senior colleague. No emoticons or emojis. No hype words ("game-changer", "revolutionary", "unlock"), no exclamation marks in a row, no fake urgency.

RULES WE NEVER BREAK
- Education only: never give financial or investment advice, trading signals or return promises.
- Never promise exam results or pass rates, and never invent numbers, reviews or testimonials.
- Market data, prices and tickers in our questions are fictional; never present them as real.
- FinCoursa is not affiliated with or endorsed by the CMT Association; CMT is their trademark.
- Only mention offers that are live (listed in the live facts).
- Contact email: team@fincoursa.com.`;

export async function getProfile(): Promise<string> {
  const v = await getSetting<{ text?: string }>("marketing_profile");
  return v?.text?.trim() || DEFAULT_PROFILE;
}

type Course = { id: string; slug: string; title: string; access_days: number | null; cashback_mode: string | null; cashback_percent: number | null; cashback_fixed: Record<string, number> | null; prices: { currency: string; amount_minor: number; is_active: boolean }[] };

/** Live facts: courses with prices and links, live offers, deadlines. */
export async function liveFacts() {
  const db = createAdminClient();
  const site = env.siteUrl.replace(/\/$/, "");
  const [{ data }, cb, fs] = await Promise.all([
    db.from("courses").select("id, slug, title, access_days, cashback_mode, cashback_percent, cashback_fixed, prices(currency, amount_minor, is_active)")
      .eq("status", "published").eq("coming_soon", false),
    getCashbackSettings(), getFoundingSettings(),
  ]);
  const courses = ((data ?? []) as Course[]).map((c) => {
    const prices = c.prices.filter((p) => p.is_active);
    const offers: string[] = [];
    for (const p of prices.slice(0, 1)) {
      const l = cashbackLabel(cashbackRule(cb, { mode: c.cashback_mode as never, percent: c.cashback_percent, fixed: c.cashback_fixed }), p.currency);
      if (l) offers.push(`${l === "100%" ? "The full course fee" : `${l} of the fee`} is returned as FinCoursa credit for future courses (before tax${cb.validity_days ? `, valid ${cb.validity_days} days` : ""})`);
    }
    const fl = foundingLabel(fs, prices[0]?.currency ?? env.defaultCurrency);
    if (fl && joiningOpen(fs) && fs.qualifying_course_ids.includes(c.id)) {
      offers.push(`Founding member offer: buyers before ${fs.join_ends_at ? formatDate(fs.join_ends_at, "long") : "joining closes"}${fs.cap ? ` (first ${fs.cap} buyers)` : ""} get ${fl} off every future FinCoursa course${fs.benefit_ends_at ? ` until ${formatDate(fs.benefit_ends_at)}` : ", for life"}`);
    }
    return {
      title: c.title, link: `${site}/courses/${c.slug}`,
      prices: prices.map((p) => formatMoney(p.amount_minor, p.currency)),
      access: c.access_days ? `${c.access_days} days of access` : "lifetime access",
      live_offers: offers,
    };
  });
  return { today: formatDate(new Date().toISOString(), "long"), website: site, courses };
}

/** Plain numbers for the last 7 and 30 days. */
export async function recentNumbers() {
  const db = createAdminClient();
  const since = (d: number) => new Date(Date.now() - d * 86400_000).toISOString();
  const period = async (days: number) => {
    const [signups, optins, checkouts, paid, emails] = await Promise.all([
      db.from("profiles").select("id", { count: "exact", head: true }).gte("created_at", since(days)),
      db.from("profiles").select("id", { count: "exact", head: true }).gte("created_at", since(days)).eq("marketing_opt_in", true),
      db.from("orders").select("id", { count: "exact", head: true }).gte("created_at", since(days)),
      db.from("orders").select("total_minor, currency").eq("status", "paid").gte("paid_at", since(days)),
      db.from("email_log").select("template").gte("created_at", since(days)).like("template", "auto_%"),
    ]);
    const revenue: Record<string, number> = {};
    for (const o of paid.data ?? []) revenue[o.currency] = (revenue[o.currency] ?? 0) + Number(o.total_minor);
    const auto: Record<string, number> = {};
    for (const e of emails.data ?? []) auto[e.template] = (auto[e.template] ?? 0) + 1;
    return {
      new_accounts: signups.count ?? 0, new_accounts_agreeing_to_marketing_emails: optins.count ?? 0,
      checkouts_started: checkouts.count ?? 0, paid_orders: paid.data?.length ?? 0,
      revenue: Object.entries(revenue).map(([c, v]) => formatMoney(v, c)),
      automatic_emails_sent: auto,
    };
  };
  const [last7, last30, { count: subscribers }] = await Promise.all([
    period(7), period(30),
    db.from("profiles").select("id", { count: "exact", head: true }).eq("marketing_opt_in", true),
  ]);
  return { last_7_days: last7, last_30_days: last30, people_who_agreed_to_marketing_emails_in_total: subscribers ?? 0,
    note: "Website visits and LinkedIn results are not available here; ask the user for them if needed." };
}

export type Topic = { id: string; title: string };

/** Quiz lessons of published courses, as topics to write about. */
export async function topics(): Promise<Topic[]> {
  const { data } = await createAdminClient().from("lessons")
    .select("id, title, position, course:courses!inner(status), chapter:chapters(title, position)")
    .eq("type", "quiz").eq("course.status", "published").limit(200);
  type Row = { id: string; title: string; position: number; chapter: { title: string; position: number } | null };
  return ((data ?? []) as unknown as Row[])
    .filter((l) => !l.title.startsWith("Chart Practice"))
    .sort((a, b) => (a.chapter?.position ?? 0) - (b.chapter?.position ?? 0) || a.position - b.position)
    .map((l) => ({ id: l.id, title: `${l.chapter?.title ? `${l.chapter.title}: ` : ""}${l.title}` }));
}

/** A few real questions and explanations from one topic, so content is built on our actual material. */
export async function topicSamples(lessonId: string, n = 3) {
  const db = createAdminClient();
  const [{ data: body }, { data: key }, { data: lesson }] = await Promise.all([
    db.from("lesson_bodies").select("body").eq("lesson_id", lessonId).maybeSingle(),
    db.from("quiz_answer_keys").select("answers, explanations").eq("lesson_id", lessonId).maybeSingle(),
    db.from("lessons").select("title").eq("id", lessonId).maybeSingle(),
  ]);
  type Q = { id: string; prompt: string; options: { id: string; text: string }[]; image?: string | null };
  const qs = ((body?.body as { questions?: Q[] } | null)?.questions ?? []).filter((q) => !q.image);
  // spread the picks across the lesson rather than always the first questions
  const step = Math.max(1, Math.floor(qs.length / n));
  const picks = qs.filter((_, i) => i % step === 0).slice(0, n);
  return {
    topic: lesson?.title ?? "",
    questions: picks.map((q) => ({
      question: q.prompt,
      options: q.options.map((o) => o.text),
      correct: q.options.find((o) => o.id === (key?.answers as Record<string, string> | null)?.[q.id])?.text ?? null,
      explanation: (key?.explanations as Record<string, string> | null)?.[q.id] ?? null,
    })),
  };
}
