import Link from "next/link";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/format";
import { Stat, Card, Progress, RangePicker } from "@/components/dash/Stat";
import { ColumnChart } from "@/components/dash/ColumnChart";
import { EarningsStatement } from "@/components/dash/EarningsStatement";
import { summarize, type Earning } from "@/lib/instructor-statement";

export type InstructorCourseRow = { course_id: string; title: string; slug: string; students: number; avg_progress: number; completions: number; earnings_minor: number; share: number };
export type InstructorDashboardData = {
  currency: string; days: number;
  pending_minor: number; approved_minor: number; paid_minor: number;
  series: { day: string; amount_minor: number }[];
  courses: InstructorCourseRow[];
  earnings: Earning[];
  payouts: { id: string; amount_minor: number; currency: string; status: string; paid_at: string | null; created_at: string; reference: string | null }[];
};

/**
 * The instructor dashboard body: stats, daily earnings, courses, earnings statement and payouts.
 * Used by the instructor's own page and, unchanged, by Admin -> Instructors -> (instructor), so the admin sees exactly what they see.
 */
export function InstructorDashboardView({ d, basePath, sp, title = "Instructor dashboard", instructorId }: {
  d: InstructorDashboardData; basePath: string; sp: { course?: string | null; month?: string | null }; title?: string; instructorId?: string;
}) {
  const m = (n: number) => formatMoney(n, d.currency);
  const all = summarize(d.earnings);
  const students = d.courses.reduce((s, c) => s + c.students, 0);
  const periodTotal = d.series.reduce((s, r) => s + Number(r.amount_minor), 0);
  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-3xl font-bold text-primary">{title}</h2>
        <RangePicker current={d.days} base={basePath} />
      </div>
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-5">
        <Stat label="Total earned (all time)" value={m(all.earned)} hint={`${all.sales} ${all.sales === 1 ? "sale" : "sales"} · ${m(all.paid)} in course sales`} />
        <Stat label={`Earnings, last ${d.days} days`} value={m(periodTotal)} />
        <Stat label="Pending (in refund window)" value={m(d.pending_minor)} hint="Becomes payable 30 days after the sale" />
        <Stat label="Ready for payout" value={m(d.approved_minor)} />
        <Stat label="Paid out to date" value={m(d.paid_minor)} />
      </div>
      <Card title="Daily earnings">
        <ColumnChart label="Earnings" currency={d.currency} data={d.series.map((r) => ({ x: r.day, y: Number(r.amount_minor) }))} />
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
              {d.courses.map((c) => (
                <tr key={c.course_id} className="border-t border-line">
                  <td className="py-3">{c.title}</td>
                  <td className="py-3 text-right tabular-nums">{c.students}</td>
                  <td className="py-3 pl-6"><Progress pct={Number(c.avg_progress)} /></td>
                  <td className="py-3 text-right tabular-nums">{c.completions}</td>
                  <td className="py-3 text-right tabular-nums">{c.share}%</td>
                  <td className="py-3 text-right tabular-nums">{m(c.earnings_minor)}</td>
                  <td className="py-3 text-right"><Link href={`/instructor/courses/${c.course_id}`} className="text-primary underline">View report</Link></td>
                </tr>
              ))}
              {!d.courses.length && <tr><td colSpan={7} className="py-6 text-center text-muted">No courses assigned yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
      <EarningsStatement earnings={d.earnings} currency={d.currency} basePath={basePath}
        courses={d.courses.map((c) => ({ id: c.course_id, title: c.title, share: c.share }))}
        course={sp.course ?? null} month={sp.month ?? null} instructorId={instructorId} />
      <Card title="Payout history">
        {d.payouts.length ? (
          <ul className="divide-y divide-line text-sm">
            {d.payouts.map((p) => (
              <li key={p.id} className="flex justify-between py-2">
                <span>{formatDate(p.paid_at ?? p.created_at)} · {p.status}{p.reference && ` · ${p.reference}`}</span>
                <span className="tabular-nums">{formatMoney(p.amount_minor, p.currency)}</span>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-muted">No payouts yet.</p>}
      </Card>
    </div>
  );
}
