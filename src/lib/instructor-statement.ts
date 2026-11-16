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

export async function loadEarnings(db: SupabaseClient, opts: { courseId?: string } = {}): Promise<Earning[]> {
  let q = db.from("instructor_earnings").select(COLS).order("created_at", { ascending: false }).limit(5000);
  if (opts.courseId) q = q.eq("course_id", opts.courseId);
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
