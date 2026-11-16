import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { MyAgreements } from "@/components/dash/MyAgreements";
import { createClient } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/money";
import { env } from "@/lib/env";
import { Stat, Card, Progress, RangePicker } from "@/components/dash/Stat";
import { ColumnChart } from "@/components/dash/ColumnChart";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Instructor dashboard" };

type CourseRow = { course_id: string; title: string; slug: string; students: number; avg_progress: number; completions: number; earnings_minor: number };

export default async function InstructorDashboard({ searchParams }: PageProps<"/instructor">) {
  const me = await requireRole(["instructor"], "/instructor");
  const days = Math.min(365, Math.max(7, Number((await searchParams).days) || 30));
  const cur = env.defaultCurrency;
  const supabase = await createClient();
  const [{ data: summary, error }, { data: series }, { data: payouts }] = await Promise.all([
    supabase.rpc("instructor_summary", { p_currency: cur }),
    supabase.rpc("instructor_earnings_series", { p_days: days, p_currency: cur }),
    supabase.from("payouts").select("id, amount_minor, currency, status, paid_at, created_at, reference").eq("payee_type", "instructor").order("created_at", { ascending: false }).limit(10),
  ]);
  // the revenue share the admin set: per course, else the instructor's default
  const { data: me2 } = await supabase.from("instructors").select("id, default_revenue_share_pct").eq("user_id", me.id).maybeSingle();
  const { data: links } = me2 ? await supabase.from("course_instructors").select("course_id, revenue_share_pct").eq("instructor_id", me2.id) : { data: [] as { course_id: string; revenue_share_pct: number | null }[] };
  const shareFor = (courseId: string) => {
    const l = (links ?? []).find((x) => x.course_id === courseId);
    return Number(l?.revenue_share_pct ?? me2?.default_revenue_share_pct ?? 0);
  };
  // each sale behind the earnings: no student names or emails, only what the sale was worth and the share
  const { data: earningRows } = await supabase.from("instructor_earnings")
    .select("id, created_at, course_id, currency, net_revenue_minor, share_pct, amount_minor, status, available_at, list_minor, code_discount_minor, credit_used_minor, payment_fee_minor, payment_fee_pct, partner_minor, cashback_minor, shared_minor, course:courses(title)")
    .order("created_at", { ascending: false }).limit(500);
  type Earning = { id: string; created_at: string; currency: string; net_revenue_minor: number; share_pct: number; amount_minor: number; status: string; available_at: string | null;
    list_minor: number | null; code_discount_minor: number; credit_used_minor: number; payment_fee_minor: number; payment_fee_pct: number; partner_minor: number; cashback_minor: number; shared_minor: number | null;
    course: { title: string } | null };
  const earnings = (earningRows ?? []) as unknown as Earning[];
  const live = earnings.filter((e) => e.status !== "reversed");
  const lifetime = live.reduce((a, e) => a + Number(e.amount_minor), 0);
  const lifetimeSales = live.reduce((a, e) => a + Number(e.net_revenue_minor), 0);
  const sum = (k: keyof Earning) => live.reduce((a, e) => a + Number(e[k] ?? 0), 0);
  const totals = { fee: sum("payment_fee_minor"), partner: sum("partner_minor"), cashback: sum("cashback_minor"), shared: live.reduce((a, e) => a + Number(e.shared_minor ?? e.net_revenue_minor), 0) };
  const EARN_STATUS: Record<string, string> = { pending: "In refund window", approved: "Ready for payout", paid: "Paid", reversed: "Refunded (cancelled)" };
  if (error) return <p className="text-danger">Your instructor profile isn&apos;t linked yet. Ask an admin to connect it to your account.</p>;
  const m = (n: number) => formatMoney(n, cur);
  const courses = (summary.courses ?? []) as CourseRow[];
  const shares = [...new Set(courses.map((c) => shareFor(c.course_id)))];
  const students = courses.reduce((s, c) => s + c.students, 0);
  const periodTotal = (series ?? []).reduce((s: number, r: { amount_minor: number }) => s + Number(r.amount_minor), 0);

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-bold text-primary">Instructor dashboard</h1>
        <RangePicker current={days} base="/instructor" />
      </div>
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-5">
        <Stat label="Total earned (all time)" value={m(lifetime)} hint={`${live.length} ${live.length === 1 ? "sale" : "sales"} · ${m(lifetimeSales)} in course sales`} />
        <Stat label={`Earnings, last ${days} days`} value={m(periodTotal)} />
        <Stat label="Pending (in refund window)" value={m(summary.pending_minor)} hint="Becomes payable 30 days after the sale" />
        <Stat label="Ready for payout" value={m(summary.approved_minor)} />
        <Stat label="Paid out to date" value={m(summary.paid_minor)} />
      </div>
      <Card title="Daily earnings">
        <ColumnChart label="Earnings" currency={cur} data={(series ?? []).map((r: { day: string; amount_minor: number }) => ({ x: r.day, y: Number(r.amount_minor) }))} />
      </Card>
      <Card title={`My courses · ${students} students`}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="text-left text-muted"><tr>
              <th className="py-2 font-medium">Course</th><th className="py-2 text-right font-medium">Students</th>
              <th className="w-48 py-2 pl-6 font-medium">Avg. progress</th><th className="py-2 text-right font-medium">Completed</th>
              <th className="py-2 text-right font-medium">Your share</th><th className="py-2 text-right font-medium">Earnings</th><th />
            </tr></thead>
            <tbody>
              {courses.map((c) => (
                <tr key={c.course_id} className="border-t border-line">
                  <td className="py-3">{c.title}</td>
                  <td className="py-3 text-right tabular-nums">{c.students}</td>
                  <td className="py-3 pl-6"><Progress pct={Number(c.avg_progress)} /></td>
                  <td className="py-3 text-right tabular-nums">{c.completions}</td>
                  <td className="py-3 text-right tabular-nums">{shareFor(c.course_id)}%</td>
                  <td className="py-3 text-right tabular-nums">{m(c.earnings_minor)}</td>
                  <td className="py-3 text-right"><Link href={`/instructor/courses/${c.course_id}`} className="text-primary underline">View report</Link></td>
                </tr>
              ))}
              {!courses.length && <tr><td colSpan={7} className="py-6 text-center text-muted">No courses assigned yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
      <Card title="Your earnings statement">
        <div className="grid gap-5 text-sm">
          {courses.length > 0 && (
            <p className="text-base"><b>Your revenue share: {shares.length === 1 ? `${shares[0]}%` : courses.map((c) => `${c.title} ${shareFor(c.course_id)}%`).join(" · ")}</b>{shares.length === 1 && courses.length > 1 ? " on all your courses" : ""}</p>
          )}
          {/* the waterfall for all sales so far */}
          <div className="grid gap-1 rounded-xl bg-surface p-4 tabular-nums">
            <div className="flex justify-between"><span>Course sales (what students paid, excluding tax)</span><b>{m(lifetimeSales)}</b></div>
            <div className="flex justify-between text-muted"><span>&minus; Payment processing fees</span><span>{m(totals.fee)}</span></div>
            <div className="flex justify-between text-muted"><span>&minus; Partner commissions (sales through a partner&apos;s link or code)</span><span>{m(totals.partner)}</span></div>
            <div className="flex justify-between text-muted"><span>&minus; Cashback credit given to students</span><span>{m(totals.cashback)}</span></div>
            <div className="mt-1 flex justify-between border-t border-line pt-2"><span>= Amount shared with you</span><b>{m(totals.shared)}</b></div>
            <div className="flex justify-between text-muted"><span>&times; Your revenue share</span><span>{shares.length === 1 ? `${shares[0]}%` : "per course, below"}</span></div>
            <div className="mt-1 flex justify-between border-t-2 border-ink pt-2 text-base"><b>= Your earnings</b><b>{m(lifetime)}</b></div>
          </div>
          <details className="rounded-xl border border-line p-4">
            <summary className="cursor-pointer font-semibold">How each figure is worked out</summary>
            <ul className="mt-3 grid list-disc gap-1.5 pl-5 text-muted">
              <li><b className="text-ink">What students paid:</b> the course price after any discount code and any FinCoursa credit the student used, excluding tax. A programme&apos;s price is split equally across its courses.</li>
              <li><b className="text-ink">Payment processing fee:</b> the card and payment gateway fee on the sale, at the standard rate shown on each sale. No fee on free enrolments.</li>
              <li><b className="text-ink">Partner commission:</b> only when the student came through a FinCoursa partner&apos;s referral link or code.</li>
              <li><b className="text-ink">Cashback credit:</b> the FinCoursa credit a student receives for buying (and for a review, during offers that include it). It is a cost of the sale, so it is taken off before the share.</li>
              <li><b className="text-ink">Your earnings:</b> the amount shared &times; your revenue share, never below zero. Earnings become payable 30 days after the sale, once the refund window has passed. A refunded sale is cancelled.</li>
              <li>Student names and contact details are never shown.</li>
            </ul>
          </details>
          {!earnings.length ? <p className="text-muted">No sales yet. Each sale of your courses will appear here with its full calculation.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-sm tabular-nums">
                <thead className="text-left text-muted"><tr>
                  <th className="py-2 font-medium">Date</th><th className="py-2 font-medium">Course</th>
                  <th className="py-2 text-right font-medium">Paid (excl. tax)</th><th className="py-2 text-right font-medium">Payment fee</th>
                  <th className="py-2 text-right font-medium">Partner</th><th className="py-2 text-right font-medium">Cashback</th>
                  <th className="py-2 text-right font-medium">Shared</th><th className="py-2 text-right font-medium">Share</th>
                  <th className="py-2 text-right font-medium">You earn</th><th className="py-2 pl-4 font-medium">Status</th>
                </tr></thead>
                <tbody>
                  {earnings.map((e) => {
                    const f = (n: number | null | undefined) => (Number(n ?? 0) ? `−${formatMoney(Number(n), e.currency)}` : "–");
                    return (
                      <tr key={e.id} className={`border-t border-line align-top ${e.status === "reversed" ? "text-muted line-through" : ""}`}>
                        <td className="py-2.5 whitespace-nowrap">{formatDate(e.created_at)}</td>
                        <td className="py-2.5">{e.course?.title ?? "Course"}
                          {e.list_minor != null && (Number(e.code_discount_minor) > 0 || Number(e.credit_used_minor) > 0) && (
                            <span className="block text-xs text-muted">Price {formatMoney(e.list_minor, e.currency)}{Number(e.code_discount_minor) > 0 ? ` · code −${formatMoney(e.code_discount_minor, e.currency)}` : ""}{Number(e.credit_used_minor) > 0 ? ` · credit −${formatMoney(e.credit_used_minor, e.currency)}` : ""}</span>
                          )}</td>
                        <td className="py-2.5 text-right">{formatMoney(e.net_revenue_minor, e.currency)}</td>
                        <td className="py-2.5 text-right text-muted">{f(e.payment_fee_minor)}{Number(e.payment_fee_minor) > 0 && <span className="block text-xs">{Number(e.payment_fee_pct)}%</span>}</td>
                        <td className="py-2.5 text-right text-muted">{f(e.partner_minor)}</td>
                        <td className="py-2.5 text-right text-muted">{f(e.cashback_minor)}</td>
                        <td className="py-2.5 text-right">{formatMoney(e.shared_minor ?? e.net_revenue_minor, e.currency)}</td>
                        <td className="py-2.5 text-right">&times; {Number(e.share_pct)}%</td>
                        <td className="py-2.5 text-right font-semibold">{formatMoney(e.amount_minor, e.currency)}</td>
                        <td className="py-2.5 pl-4 whitespace-nowrap text-muted">{EARN_STATUS[e.status] ?? e.status}{e.status === "pending" && e.available_at ? <span className="block text-xs">payable {formatDate(e.available_at)}</span> : null}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot><tr className="border-t-2 border-ink font-semibold">
                  <td className="py-2.5" colSpan={2}>Total (excluding refunded sales)</td>
                  <td className="py-2.5 text-right">{m(lifetimeSales)}</td><td className="py-2.5 text-right">{totals.fee ? `−${m(totals.fee)}` : "–"}</td>
                  <td className="py-2.5 text-right">{totals.partner ? `−${m(totals.partner)}` : "–"}</td><td className="py-2.5 text-right">{totals.cashback ? `−${m(totals.cashback)}` : "–"}</td>
                  <td className="py-2.5 text-right">{m(totals.shared)}</td><td />
                  <td className="py-2.5 text-right">{m(lifetime)}</td><td />
                </tr></tfoot>
              </table>
            </div>
          )}
        </div>
      </Card>
      <Card title="Payout history">
        {payouts?.length ? (
          <ul className="divide-y divide-line text-sm">
            {payouts.map((p) => (
              <li key={p.id} className="flex justify-between py-2">
                <span>{formatDate(p.paid_at ?? p.created_at)} · {p.status}{p.reference && ` · ${p.reference}`}</span>
                <span className="tabular-nums">{formatMoney(p.amount_minor, p.currency)}</span>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-muted">No payouts yet.</p>}
      </Card>
      <MyAgreements userId={me.id} />
    </div>
  );
}
