import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * An instructor's earnings statement: one row per course sold, with no student details.
 * Rows come from instructor_earnings through the signed-in user's own client, so row-level security
 * limits an instructor to their own sales (staff see all).
 */
export type Earning = {
  id: string; created_at: string; course_id: string; currency: string; status: string; available_at: string | null;
  net_revenue_minor: number; share_pct: number; amount_minor: number;
  list_minor: number | null; code_discount_minor: number; credit_used_minor: number;
  payment_fee_minor: number; payment_fee_pct: number; partner_minor: number;
  cashback_minor: number; cashback_given_minor: number; cashback_counted_pct: number; shared_minor: number | null;
  course: { title: string } | null;
};

const COLS = "id, created_at, course_id, currency, status, available_at, net_revenue_minor, share_pct, amount_minor, list_minor, code_discount_minor, credit_used_minor, payment_fee_minor, payment_fee_pct, partner_minor, cashback_minor, cashback_given_minor, cashback_counted_pct, shared_minor, course:courses(title)";

export async function loadEarnings(db: SupabaseClient, opts: { courseId?: string; instructorId?: string } = {}): Promise<Earning[]> {
  let q = db.from("instructor_earnings").select(COLS).order("created_at", { ascending: false }).limit(5000);
  if (opts.courseId) q = q.eq("course_id", opts.courseId);
  if (opts.instructorId) q = q.eq("instructor_id", opts.instructorId);
  const { data } = await q;
  return (data ?? []) as unknown as Earning[];
}

/** "2026-11" in UAE time, so a sale late on the 30th lands in the right month. */
export const monthKey = (d: string) => new Date(new Date(d).getTime() + 4 * 3600e3).toISOString().slice(0, 7);
export const monthLabel = (k: string) => new Date(`${k}-15T00:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });

export function filterEarnings(rows: Earning[], f: { course?: string | null; month?: string | null }) {
  return rows.filter((e) => (!f.course || e.course_id === f.course) && (!f.month || monthKey(e.created_at) === f.month));
}

/** Totals for a set of sales (refunded sales left out). */
export function summarize(rows: Earning[]) {
  const live = rows.filter((e) => e.status !== "reversed");
  const sum = (k: keyof Earning) => live.reduce((a, e) => a + Number(e[k] ?? 0), 0);
  return {
    sales: live.length,
    paid: sum("net_revenue_minor"),
    fee: sum("payment_fee_minor"),
    partner: sum("partner_minor"),
    cashback: sum("cashback_minor"),
    cashbackGiven: sum("cashback_given_minor"),
    shared: live.reduce((a, e) => a + Number(e.shared_minor ?? e.net_revenue_minor), 0),
    earned: sum("amount_minor"),
    cashbackPcts: [...new Set(live.filter((e) => Number(e.cashback_given_minor) > 0).map((e) => Number(e.cashback_counted_pct)))],
  };
}

export const EARN_STATUS: Record<string, string> = { pending: "In refund window", approved: "Ready for payout", paid: "Paid", reversed: "Refunded (cancelled)" };

/** The statement as CSV (amounts in major units, e.g. 79.00). */
export function statementCsv(rows: Earning[], minorFactor: (currency: string) => number) {
  const cell = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const amt = (n: number | null | undefined, c: string) => (Number(n ?? 0) / minorFactor(c)).toFixed(2);
  const head = ["Date", "Course", "Currency", "List price", "Discount code", "Credit used", "Paid by student (excl. tax)", "Payment fee %", "Payment fee",
    "Partner commission", "Cashback given", "Cashback counted %", "Cashback taken off", "Amount shared", "Your share %", "Your earnings", "Status", "Payable from"];
  const lines = rows.map((e) => [
    e.created_at.slice(0, 10), e.course?.title ?? "", e.currency, amt(e.list_minor, e.currency), amt(e.code_discount_minor, e.currency), amt(e.credit_used_minor, e.currency),
    amt(e.net_revenue_minor, e.currency), Number(e.payment_fee_pct), amt(e.payment_fee_minor, e.currency), amt(e.partner_minor, e.currency),
    amt(e.cashback_given_minor, e.currency), Number(e.cashback_counted_pct), amt(e.cashback_minor, e.currency), amt(e.shared_minor ?? e.net_revenue_minor, e.currency),
    Number(e.share_pct), amt(e.amount_minor, e.currency), EARN_STATUS[e.status] ?? e.status, e.available_at ? e.available_at.slice(0, 10) : "",
  ].map(cell).join(","));
  return [head.map(cell).join(","), ...lines].join("\n");
}

/**
 * Everything the instructor dashboard shows, for one instructor, built with an admin (service) client.
 * Mirrors instructor_summary / instructor_earnings_series, which only work for the signed-in instructor.
 */
export async function loadInstructorDashboard(db: SupabaseClient, instructorId: string, currency: string, days: number) {
  const [{ data: ins }, { data: links }, earnings, { data: payouts }] = await Promise.all([
    db.from("instructors").select("default_revenue_share_pct").eq("id", instructorId).maybeSingle(),
    db.from("course_instructors").select("course_id, revenue_share_pct, course:courses(id, title, slug)").eq("instructor_id", instructorId),
    loadEarnings(db, { instructorId }),
    db.from("payouts").select("id, amount_minor, currency, status, paid_at, created_at, reference").eq("payee_type", "instructor").eq("instructor_id", instructorId).order("created_at", { ascending: false }).limit(10),
  ]);
  type Link = { course_id: string; revenue_share_pct: number | null; course: { id: string; title: string; slug: string } | null };
  const ls = (links ?? []) as unknown as Link[];
  const ids = ls.map((l) => l.course_id);
  const { data: enr } = ids.length
    ? await db.from("enrollments").select("course_id, progress_pct, completed_at").in("course_id", ids).is("revoked_at", null).limit(50000)
    : { data: [] as { course_id: string; progress_pct: number; completed_at: string | null }[] };
  const inCur = earnings.filter((e) => e.currency === currency);
  const live = inCur.filter((e) => e.status !== "reversed");
  const sumStatus = (st: string) => inCur.filter((e) => e.status === st).reduce((a, e) => a + Number(e.amount_minor), 0);
  const courses = ls.filter((l) => l.course).map((l) => {
    const rows = (enr ?? []).filter((e) => e.course_id === l.course_id);
    return {
      course_id: l.course_id, title: l.course!.title, slug: l.course!.slug,
      students: rows.length,
      avg_progress: rows.length ? Math.round((rows.reduce((a, e) => a + Number(e.progress_pct ?? 0), 0) / rows.length) * 10) / 10 : 0,
      completions: rows.filter((e) => e.completed_at).length,
      earnings_minor: live.filter((e) => e.course_id === l.course_id).reduce((a, e) => a + Number(e.amount_minor), 0),
      share: Number(l.revenue_share_pct ?? ins?.default_revenue_share_pct ?? 0),
    };
  }).sort((a, b) => a.title.localeCompare(b.title));
  // daily earnings for the last `days` days (UTC days, like the database series)
  const series: { day: string; amount_minor: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const day = new Date(Date.now() - i * 864e5).toISOString().slice(0, 10);
    series.push({ day, amount_minor: live.filter((e) => e.created_at.slice(0, 10) === day).reduce((a, e) => a + Number(e.amount_minor), 0) });
  }
  return {
    currency, days, pending_minor: sumStatus("pending"), approved_minor: sumStatus("approved"), paid_minor: sumStatus("paid"),
    series, courses, earnings, payouts: (payouts ?? []) as { id: string; amount_minor: number; currency: string; status: string; paid_at: string | null; created_at: string; reference: string | null }[],
  };
}
