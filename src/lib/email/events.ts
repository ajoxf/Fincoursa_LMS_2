import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { env } from "@/lib/env";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/format";
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
    .select("id, number, user_id, status, currency, discount_minor, tax_minor, total_minor, tax_rate, paid_at, billing_country, order_items(title, unit_amount_minor, quantity, course:courses(slug))")
    .eq("id", orderId).maybeSingle();
  if (!o || o.status !== "paid" || o.total_minor <= 0) return;
  const p = await profile(o.user_id);
  if (!p?.email) return;
  const m = (n: number) => formatMoney(n, o.currency);
  const { data: tax } = o.billing_country ? await db.from("tax_rates").select("name").eq("country_code", o.billing_country).maybeSingle() : { data: null };
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  const firstCourse = (o.order_items?.[0]?.course as any)?.slug as string | undefined;
  const t = T.receiptEmail({
    name: p.full_name, orderNumber: o.number, date: formatDate(o.paid_at, "long"),
    lines: (o.order_items ?? []).map((i) => ({ title: i.title, amount: m(i.unit_amount_minor * i.quantity) })),
    discount: o.discount_minor ? m(o.discount_minor) : null,
    vat: o.tax_minor ? m(o.tax_minor) : null, vatLabel: tax?.name ? `${tax.name} ${(Number(o.tax_rate) * 100).toFixed(0)}%` : null,
    total: m(o.total_minor), invoiceUrl: `${site()}/api/invoices/${o.id}`,
    learnUrl: firstCourse ? `${site()}/learn/${firstCourse}` : `${site()}/dashboard`, trn: process.env.COMPANY_TRN ?? null,
  });
  await sendEmail({ ...t, to: p.email, template: "receipt", ref: o.id });
}

/** Sent once per certificate, the moment a course reaches 100%. */
export async function sendCourseCompleted(userId: string, courseId: string) {
  const db = createAdminClient();
  const { data: c } = await db.from("certificates").select("id, serial, course:courses(title)").eq("user_id", userId).eq("course_id", courseId).maybeSingle();
  if (!c) return;
  const p = await profile(userId);
  if (!p?.email) return;
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  const course = (c.course as any)?.title ?? "your course";
  const t = T.courseCompletedEmail({ name: p.full_name, course, certificateUrl: `${site()}/certificates/${c.serial}`, nextUrl: `${site()}/pages/paid-courses` });
  await sendEmail({ ...t, to: p.email, template: "course_completed", ref: c.id });
}

/** Catch-up for any certificate issued without its email (runs from the daily cron). */
export async function sendMissedCompletionEmails(sinceHours = 72) {
  const db = createAdminClient();
  const since = new Date(Date.now() - sinceHours * 3600_000).toISOString();
  const { data: certs } = await db.from("certificates").select("id, user_id, course_id").gte("issued_at", since).limit(500);
  if (!certs?.length) return 0;
  const { data: sent } = await db.from("email_log").select("ref").eq("template", "course_completed").in("ref", certs.map((c) => c.id));
  const done = new Set((sent ?? []).map((s) => s.ref));
  let n = 0;
  for (const c of certs) if (!done.has(c.id)) { await sendCourseCompleted(c.user_id, c.course_id); n++; }
  return n;
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
export async function sendSignInLink(email: string, next: string, kind: "signin" | "migration" = "signin") {
  const db = createAdminClient();
  const { data: p } = await db.from("profiles").select("id, full_name").eq("email", email.toLowerCase()).maybeSingle();
  if (!p) return false;
  const { data, error } = await db.auth.admin.generateLink({ type: "magiclink", email });
  if (error || !data?.properties?.hashed_token) { console.error("[auth] generateLink failed", error); return false; }
  const url = `${site()}/auth/confirm?token_hash=${encodeURIComponent(data.properties.hashed_token)}&type=magiclink&next=${encodeURIComponent(next)}`;
  const ref = `${p.id}:${Date.now()}`;
  if (kind === "migration") {
    const { count } = await db.from("enrollments").select("id", { count: "exact", head: true }).eq("user_id", p.id).is("revoked_at", null);
    const t = T.migrationInviteEmail({ name: p.full_name, url, courseCount: count ?? 0, minutes: LINK_MINUTES });
    return sendEmail({ ...t, to: email, template: "migration_invite", ref: p.id });
  }
  const t = T.signInLinkEmail({ url, minutes: LINK_MINUTES });
  return sendEmail({ ...t, to: email, template: "sign_in_link", ref });
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
