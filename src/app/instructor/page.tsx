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
  // each sale behind the earnings: no student names or emails, only what the sale was worth and the share
  const { data: earningRows } = await supabase.from("instructor_earnings")
    .select("id, created_at, course_id, currency, net_revenue_minor, share_pct, amount_minor, status, available_at, course:courses(title)")
    .order("created_at", { ascending: false }).limit(500);
  type Earning = { id: string; created_at: string; currency: string; net_revenue_minor: number; share_pct: number; amount_minor: number; status: string; available_at: string | null; course: { title: string } | null };
  const earnings = (earningRows ?? []) as unknown as Earning[];
  const live = earnings.filter((e) => e.status !== "reversed");
  const lifetime = live.reduce((a, e) => a + Number(e.amount_minor), 0);
  const lifetimeSales = live.reduce((a, e) => a + Number(e.net_revenue_minor), 0);
  const EARN_STATUS: Record<string, string> = { pending: "In refund window", approved: "Ready for payout", paid: "Paid", reversed: "Refunded (cancelled)" };
  if (error) return <p className="text-danger">Your instructor profile isn&apos;t linked yet. Ask an admin to connect it to your account.</p>;
  const m = (n: number) => formatMoney(n, cur);
  const courses = (summary.courses ?? []) as CourseRow[];
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
              <th className="py-2 text-right font-medium">Earnings</th><th />
            </tr></thead>
            <tbody>
              {courses.map((c) => (
                <tr key={c.course_id} className="border-t border-line">
                  <td className="py-3">{c.title}</td>
                  <td className="py-3 text-right tabular-nums">{c.students}</td>
                  <td className="py-3 pl-6"><Progress pct={Number(c.avg_progress)} /></td>
                  <td className="py-3 text-right tabular-nums">{c.completions}</td>
                  <td className="py-3 text-right tabular-nums">{m(c.earnings_minor)}</td>
                  <td className="py-3 text-right"><Link href={`/instructor/courses/${c.course_id}`} className="text-primary underline">View report</Link></td>
                </tr>
              ))}
              {!courses.length && <tr><td colSpan={6} className="py-6 text-center text-muted">No courses assigned yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
      <Card title="How your earnings are calculated">
        <div className="grid gap-4 text-sm">
          <div className="grid gap-2 rounded-xl bg-surface p-4">
            <p><b>For each sale:</b> what the student paid for your course, after any discount code or FinCoursa credit and excluding tax, multiplied by your revenue share.</p>
            <p className="font-mono text-xs sm:text-sm">Your earnings = course price paid (excl. tax) &times; your share %</p>
            <p className="text-muted">When a course is sold as part of a programme, the programme price is split equally across its courses first. Earnings become payable 30 days after the sale, once the refund window has passed; a refunded sale is cancelled. Student names and contact details are never shown.</p>
          </div>
          {!earnings.length ? <p className="text-muted">No sales yet. Each sale of your courses will appear here with its calculation.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="text-left text-muted"><tr>
                  <th className="py-2 font-medium">Date</th><th className="py-2 font-medium">Course</th>
                  <th className="py-2 text-right font-medium">Price paid (excl. tax)</th><th className="py-2 text-right font-medium">Your share</th>
                  <th className="py-2 text-right font-medium">You earn</th><th className="py-2 pl-4 font-medium">Status</th>
                </tr></thead>
                <tbody>
                  {earnings.map((e) => (
                    <tr key={e.id} className={`border-t border-line ${e.status === "reversed" ? "text-muted line-through" : ""}`}>
                      <td className="py-2.5 whitespace-nowrap">{formatDate(e.created_at)}</td>
                      <td className="py-2.5">{e.course?.title ?? "Course"}</td>
                      <td className="py-2.5 text-right tabular-nums">{formatMoney(e.net_revenue_minor, e.currency)}</td>
                      <td className="py-2.5 text-right tabular-nums">&times; {Number(e.share_pct)}%</td>
                      <td className="py-2.5 text-right font-semibold tabular-nums">{formatMoney(e.amount_minor, e.currency)}</td>
                      <td className="py-2.5 pl-4 whitespace-nowrap text-muted">{EARN_STATUS[e.status] ?? e.status}{e.status === "pending" && e.available_at ? `, payable ${formatDate(e.available_at)}` : ""}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot><tr className="border-t-2 border-ink font-semibold">
                  <td className="py-2.5" colSpan={2}>Total (excluding refunded sales)</td>
                  <td className="py-2.5 text-right tabular-nums">{m(lifetimeSales)}</td><td />
                  <td className="py-2.5 text-right tabular-nums">{m(lifetime)}</td><td />
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
