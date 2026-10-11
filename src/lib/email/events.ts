import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { env } from "@/lib/env";
import { formatMoney } from "@/lib/money";
import { formatDate, SESSION_ZONES, sessionDay, sessionTimes } from "@/lib/format";
import { sendEmail } from "./send";
import * as T from "./templates";

const site = () => env.siteUrl.replace(/\/$/, "");
const LINK_MINUTES = 60;

async function profile(userId: string) {
  const { data } = await createAdminClient().from("profiles").select("email, full_name").eq("id", userId).maybeSingle();
  return data;
}

export async function sendWelcome(userId: string) {
  const p = await profile(userId);
  if (!p?.email) return;
  const t = T.welcomeEmail({ name: p.full_name, dashboardUrl: `${site()}/dashboard`, coursesUrl: `${site()}/pages/paid-courses` });
  await sendEmail({ ...t, to: p.email, template: "welcome", ref: userId });
}

/** Receipt with VAT breakdown and a link to the printable (tax) invoice. Safe to call more than once. */
export async function sendReceipt(orderId: string) {
  const db = createAdminClient();
  const { data: o } = await db.from("orders")
    .select("id, number, user_id, status, currency, discount_minor, tax_minor, total_minor, tax_rate, tax_name, reverse_charge, paid_at, billing_country, order_items(title, unit_amount_minor, quantity, course_id, bundle_id, course:courses(slug))")
    .eq("id", orderId).maybeSingle();
  if (!o || o.status !== "paid") return;
  // live sessions in what they bought (course, or every course in a bundle)
  const courseIds = new Set<string>((o.order_items ?? []).map((i) => i.course_id).filter(Boolean) as string[]);
  const bundleIds = (o.order_items ?? []).map((i) => i.bundle_id).filter(Boolean) as string[];
  if (bundleIds.length) (await db.from("bundle_courses").select("course_id").in("bundle_id", bundleIds)).data?.forEach((b) => courseIds.add(b.course_id));
  const { data: live } = courseIds.size
    ? await db.from("lessons").select("title, starts_at, live_minutes").in("course_id", [...courseIds]).eq("type", "live")
        .gte("starts_at", new Date().toISOString()).order("starts_at")
    : { data: [] as { title: string; starts_at: string; live_minutes: number | null }[] };
  const sessions = (live ?? []).map((l) => sessionLine(l.title, l.starts_at, l.live_minutes));
  if (o.total_minor <= 0 && !sessions.length) return; // free course: the welcome/course email is enough
  const p = await profile(o.user_id);
  if (!p?.email) return;
  const m = (n: number) => formatMoney(n, o.currency);
  const { data: tax } = o.billing_country ? await db.from("tax_rates").select("name, prices_include_tax").eq("country_code", o.billing_country).maybeSingle() : { data: null };
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  const firstCourse = (o.order_items?.[0]?.course as any)?.slug as string | undefined;
  const t = T.receiptEmail({
    name: p.full_name, orderNumber: o.number, date: formatDate(o.paid_at, "long"),
    lines: (o.order_items ?? []).map((i) => ({ title: i.title, amount: m(i.unit_amount_minor * i.quantity) })),
    discount: o.discount_minor ? m(o.discount_minor) : null,
    vat: o.tax_minor ? m(o.tax_minor) : null, vatLabel: (o.tax_name ?? tax?.name) ? `${o.tax_name ?? tax?.name} ${+(Number(o.tax_rate) * 100).toFixed(1)}%` : null,
    vatAdded: tax?.prices_include_tax === false, reverseCharge: o.reverse_charge, sessions,
    total: m(o.total_minor), invoiceUrl: `${site()}/api/invoices/${o.id}`,
    learnUrl: firstCourse ? `${site()}/learn/${firstCourse}` : `${site()}/dashboard`, trn: process.env.COMPANY_TRN ?? null,
  });
  await sendEmail({ ...t, to: p.email, template: "receipt", ref: o.id });
}

function sessionLine(title: string, startsAt: string, minutes: number | null) {
  return {
    title, day: sessionDay(startsAt),
    times: SESSION_ZONES.slice(0, 3).map((z) => `${sessionTimes(startsAt, minutes, z.tz)} ${z.label}`).join(" | "),
  };
}

/** Daily cron: remind enrolled students of live sessions starting in the next ~30 hours (once per person per session). */
export async function sendLiveReminders(hoursAhead = 30) {
  const db = createAdminClient();
  const now = new Date();
  const { data: sessions } = await db.from("lessons")
    .select("id, title, starts_at, live_minutes, course_id, course:courses(title, slug, status)")
    .eq("type", "live").gte("starts_at", now.toISOString())
    .lte("starts_at", new Date(now.getTime() + hoursAhead * 3600_000).toISOString());
  let sent = 0;
  for (const l of sessions ?? []) {
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    const course = l.course as any;
    if (!course || course.status !== "published") continue;
    const { data: students } = await db.from("enrollments").select("user_id").eq("course_id", l.course_id).is("revoked_at", null).limit(5000);
    for (const st of students ?? []) {
      const p = await profile(st.user_id);
      if (!p?.email) continue;
      const url = `${site()}/learn/${course.slug}/${l.id}`;
      const t = T.liveReminderEmail({ name: p.full_name, course: course.title, session: sessionLine(l.title, l.starts_at!, l.live_minutes), url, calendarUrl: `${site()}/api/calendar/${l.id}` });
      const r = await sendEmail({ ...t, to: p.email, template: "live_reminder", ref: `${l.id}:${st.user_id}` });
      if (r) sent++;
    }
  }
  return sent;
}

/**
 * Sent once when a course reaches 100%. Courses with certificates link to it (ref = certificate id);
 * courses without one get the plain congratulations (ref = enrolment id).
 */
export async function sendCourseCompleted(userId: string, courseId: string) {
  const db = createAdminClient();
  const { data: e } = await db.from("enrollments").select("id, completed_at, course:courses(title, slug)")
    .eq("user_id", userId).eq("course_id", courseId).maybeSingle();
  if (!e?.completed_at) return;
  const { data: c } = await db.from("certificates").select("id, serial").eq("user_id", userId).eq("course_id", courseId).maybeSingle();
  const p = await profile(userId);
  if (!p?.email) return;
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  const course = (e.course as any) as { title: string; slug: string } | null;
  const t = T.courseCompletedEmail({
    name: p.full_name, course: course?.title ?? "your course", nextUrl: `${site()}/pages/paid-courses`,
    certificateUrl: c ? `${site()}/certificates/${c.serial}` : null, courseUrl: course ? `${site()}/learn/${course.slug}` : undefined,
  });
  await sendEmail({ ...t, to: p.email, template: "course_completed", ref: c?.id ?? e.id });
}

/** Catch-up for any completion that didn't get its email (runs from the daily cron). */
export async function sendMissedCompletionEmails(sinceHours = 72) {
  const db = createAdminClient();
  const since = new Date(Date.now() - sinceHours * 3600_000).toISOString();
  const { data: done } = await db.from("enrollments").select("id, user_id, course_id").gte("completed_at", since).limit(500);
  if (!done?.length) return 0;
  const { data: certs } = await db.from("certificates").select("id, user_id, course_id").in("user_id", [...new Set(done.map((d) => d.user_id))]);
  const certOf = new Map((certs ?? []).map((c) => [`${c.user_id}:${c.course_id}`, c.id]));
  const refs = done.map((d) => certOf.get(`${d.user_id}:${d.course_id}`) ?? d.id);
  const { data: sent } = await db.from("email_log").select("ref").eq("template", "course_completed").in("ref", refs);
  const already = new Set((sent ?? []).map((s) => s.ref));
  let n = 0;
  for (let i = 0; i < done.length; i++) if (!already.has(refs[i])) { await sendCourseCompleted(done[i].user_id, done[i].course_id); n++; }
  return n;
}

/** "You're enrolled" for free enrolments: a free course, a free bundle, or an order paid in full by a coupon. */
export async function sendEnrolled(userId: string, what: { courseId?: string; bundleId?: string }, ref: string) {
  const db = createAdminClient();
  const p = await profile(userId);
  if (!p?.email) return;
  let title = "", url = `${site()}/dashboard`, courses: string[] | undefined;
  let courseIds: string[] = [];
  if (what.bundleId) {
    const { data: b } = await db.from("bundles").select("title, bundle_courses(position, course:courses(id, title))").eq("id", what.bundleId).maybeSingle();
    if (!b) return;
    title = b.title;
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    const list = ((b.bundle_courses ?? []) as any[]).sort((x, y) => (x.position ?? 0) - (y.position ?? 0)).map((x) => x.course).filter(Boolean);
    courses = list.map((c) => c.title);
    courseIds = list.map((c) => c.id);
  } else if (what.courseId) {
    const { data: c } = await db.from("courses").select("id, title, slug").eq("id", what.courseId).maybeSingle();
    if (!c) return;
    title = c.title; url = `${site()}/learn/${c.slug}`; courseIds = [c.id];
  } else return;
  const { data: e } = courseIds.length === 1
    ? await db.from("enrollments").select("expires_at").eq("user_id", userId).eq("course_id", courseIds[0]).maybeSingle()
    : { data: null };
  const { data: live } = courseIds.length
    ? await db.from("lessons").select("title, starts_at, live_minutes").in("course_id", courseIds).eq("type", "live").gte("starts_at", new Date().toISOString()).order("starts_at")
    : { data: [] as { title: string; starts_at: string; live_minutes: number | null }[] };
  const t = T.enrolledEmail({
    name: p.full_name, title, courses, url, until: e?.expires_at ? formatDate(e.expires_at, "long") : null,
    sessions: (live ?? []).map((l) => sessionLine(l.title, l.starts_at, l.live_minutes)),
  });
  await sendEmail({ ...t, to: p.email, template: "enrolled", ref });
}

/** Free order (e.g. a 100% coupon): the receipt is skipped, so confirm the enrolment instead. */
export async function sendEnrolledForOrder(orderId: string) {
  const { data: o } = await createAdminClient().from("orders").select("id, user_id, status, total_minor, order_items(course_id, bundle_id)").eq("id", orderId).maybeSingle();
  if (!o || o.status !== "paid" || o.total_minor > 0) return;
  const i = o.order_items?.[0];
  if (i) await sendEnrolled(o.user_id, { courseId: i.course_id ?? undefined, bundleId: i.bundle_id ?? undefined }, o.id);
}

/** Refund confirmation, once per refund (the admin action and the provider's webhook may both call it). */
export async function sendRefund(orderId: string) {
  const db = createAdminClient();
  const { data: o } = await db.from("orders").select("id, number, user_id, status, currency, gateway, order_items(title)").eq("id", orderId).maybeSingle();
  if (!o || !["refunded", "partially_refunded"].includes(o.status)) return;
  const { data: r } = await db.from("refunds").select("id, amount_minor").eq("order_id", orderId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!r) return;
  const p = await profile(o.user_id);
  if (!p?.email) return;
  const t = T.refundEmail({
    name: p.full_name, orderNumber: o.number, item: (o.order_items ?? []).map((i) => i.title).join(", ") || "your order",
    amount: formatMoney(r.amount_minor, o.currency), full: o.status === "refunded", invoiceUrl: `${site()}/api/invoices/${o.id}`,
    method: o.gateway?.startsWith("custom-") || o.gateway === "manual" ? "account you paid from" : null,
  });
  await sendEmail({ ...t, to: p.email, template: "refund", ref: r.id });
}

/** For providers where the buyer pays outside the site: the amount, reference and a link back to the pay page. */
export async function sendPaymentPending(orderId: string, provider: string, instructions?: string | null) {
  const db = createAdminClient();
  const { data: o } = await db.from("orders").select("id, number, user_id, status, currency, total_minor, order_items(title)").eq("id", orderId).maybeSingle();
  if (!o || o.status !== "pending") return;
  const p = await profile(o.user_id);
  if (!p?.email) return;
  const t = T.paymentPendingEmail({
    name: p.full_name, orderNumber: o.number, item: (o.order_items ?? []).map((i) => i.title).join(", "),
    amount: formatMoney(o.total_minor, o.currency), provider, instructions, payUrl: `${site()}/checkout/pay/${o.id}`,
  });
  await sendEmail({ ...t, to: p.email, template: "payment_pending", ref: o.id });
}

export async function sendPartnerApproved(affiliateId: string) {
  const db = createAdminClient();
  const { data: a } = await db.from("affiliates").select("id, user_id, code, commission_pct, approved_at").eq("id", affiliateId).maybeSingle();
  if (!a) return;
  const p = await profile(a.user_id);
  if (!p?.email) return;
  const t = T.partnerApprovedEmail({ name: p.full_name, code: a.code, commissionPct: Number(a.commission_pct), link: `${site()}/?ref=${a.code}`, dashboardUrl: `${site()}/affiliate` });
  await sendEmail({ ...t, to: p.email, template: "partner_approved", ref: a.id });
}

export async function sendPayoutPaid(payoutId: string) {
  const db = createAdminClient();
  const { data: po } = await db.from("payouts")
    .select("id, payee_type, amount_minor, currency, status, method, reference, instructor:instructors(user_id, name), affiliate:affiliates(user_id)")
    .eq("id", payoutId).maybeSingle();
  if (!po || po.status !== "paid") return;
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const userId = po.payee_type === "affiliate" ? (po.affiliate as any)?.user_id : (po.instructor as any)?.user_id;
  /* eslint-enable @typescript-eslint/no-explicit-any */
  if (!userId) return;
  const p = await profile(userId);
  if (!p?.email) return;
  const t = T.payoutPaidEmail({
    name: p.full_name, amount: formatMoney(po.amount_minor, po.currency), reference: po.reference, method: po.method,
    role: po.payee_type as "affiliate" | "instructor", dashboardUrl: `${site()}/${po.payee_type === "affiliate" ? "affiliate?tab=payouts" : "instructor"}`,
  });
  await sendEmail({ ...t, to: p.email, template: "payout_paid", ref: po.id });
}

/**
 * One-click sign-in link. We generate the token ourselves (instead of Supabase's default email)
 * so the email is branded and goes through the same provider and log as everything else.
 * Unknown emails get no email, but the caller shows the same message (no account enumeration).
 */
export async function sendSignInLink(email: string, next: string) {
  const db = createAdminClient();
  const { data: p } = await db.from("profiles").select("id, full_name").eq("email", email.toLowerCase()).maybeSingle();
  if (!p) return false;
  const { data, error } = await db.auth.admin.generateLink({ type: "magiclink", email });
  if (error || !data?.properties?.hashed_token) { console.error("[auth] generateLink failed", error); return false; }
  const url = `${site()}/auth/confirm?token_hash=${encodeURIComponent(data.properties.hashed_token)}&type=magiclink&next=${encodeURIComponent(next)}`;
  const ref = `${p.id}:${Date.now()}`;
  const t = T.signInLinkEmail({ url, minutes: LINK_MINUTES });
  return sendEmail({ ...t, to: email, template: "sign_in_link", ref });
}

/**
 * "We've moved" email for students imported from Thinkific. The button opens the sign-in page with
 * their email filled in, which sends a fresh one-click link: invites never expire before they're opened.
 * Sent once per student (email log).
 */
export async function sendMigrationInvite(userId: string) {
  const db = createAdminClient();
  const { data: p } = await db.from("profiles").select("email, full_name").eq("id", userId).maybeSingle();
  if (!p?.email) return false;
  const { count } = await db.from("enrollments").select("id", { count: "exact", head: true }).eq("user_id", userId).is("revoked_at", null);
  const url = `${site()}/users/sign_in?welcome=1&email=${encodeURIComponent(p.email)}`;
  const t = T.migrationInviteEmail({ name: p.full_name, url, courseCount: count ?? 0 });
  return sendEmail({ ...t, to: p.email, template: "migration_invite", ref: userId });
}

export async function sendPasswordReset(email: string) {
  const db = createAdminClient();
  const { data: p } = await db.from("profiles").select("id").eq("email", email.toLowerCase()).maybeSingle();
  if (!p) return false;
  const { data, error } = await db.auth.admin.generateLink({ type: "recovery", email });
  if (error || !data?.properties?.hashed_token) return false;
  const url = `${site()}/auth/confirm?token_hash=${encodeURIComponent(data.properties.hashed_token)}&type=recovery&next=${encodeURIComponent("/dashboard/settings?reset=1")}`;
  const t = T.passwordResetEmail({ url, minutes: LINK_MINUTES });
  return sendEmail({ ...t, to: email, template: "password_reset", ref: `${p.id}:${Date.now()}` });
}
