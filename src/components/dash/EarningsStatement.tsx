import { Card } from "@/components/dash/Stat";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/format";
import { EARN_STATUS, filterEarnings, monthKey, monthLabel, summarize, type Earning } from "@/lib/instructor-statement";

type CourseOption = { id: string; title: string; share: number | null };

/**
 * The instructor's earnings statement: per-course summary, course and month filters, the waterfall from what students
 * paid to earnings, an explanation of each figure, every sale, and a CSV download. No student details.
 * `fixedCourse`: on a course's own report page, only that course (no course filter or per-course table).
 */
export function EarningsStatement({ earnings, courses, currency, basePath, course, month, fixedCourse }: {
  earnings: Earning[]; courses: CourseOption[]; currency: string; basePath: string;
  course?: string | null; month?: string | null; fixedCourse?: string;
}) {
  const m = (n: number) => formatMoney(n, currency);
  const activeCourse = fixedCourse ?? (courses.some((c) => c.id === course) ? course! : null);
  const months = [...new Set(earnings.map((e) => monthKey(e.created_at)))].sort().reverse();
  const activeMonth = month && months.includes(month) ? month : null;
  const rows = filterEarnings(earnings, { course: activeCourse, month: activeMonth });
  const t = summarize(rows);
  const shares = [...new Set(courses.filter((c) => !activeCourse || c.id === activeCourse).map((c) => c.share).filter((s): s is number => s != null))];
  const shareText = shares.length === 1 ? `${shares[0]}%` : null;
  const scope = [activeCourse && !fixedCourse ? courses.find((c) => c.id === activeCourse)?.title : null, activeMonth ? monthLabel(activeMonth) : "all time"].filter(Boolean).join(", ");
  // per-course table: only on the dashboard, with more than one course and no course filter
  const perCourse = !fixedCourse && !activeCourse && courses.length > 1
    ? courses.map((c) => ({ ...c, ...summarize(filterEarnings(earnings, { course: c.id, month: activeMonth })) }))
    : [];

  return (
    <Card title="Instructor Earnings Statement">
      <div id="statement" className="grid scroll-mt-24 gap-5 text-sm">
        {shareText ? (
          <p className="text-base"><b>Your revenue share: {shareText}</b>{!activeCourse && courses.length > 1 ? " on all your courses" : ""}</p>
        ) : courses.length > 0 && shares.length > 1 ? (
          <p className="text-base"><b>Your revenue share:</b> {courses.map((c) => `${c.title} ${c.share}%`).join(" · ")}</p>
        ) : null}

        {/* filters (plain GET form, works without JavaScript) */}
        <form action={`${basePath}#statement`} className="flex flex-wrap items-end gap-3">
          {!fixedCourse && courses.length > 1 && (
            <label className="grid gap-1 text-xs font-medium">Course
              <select name="course" defaultValue={activeCourse ?? ""} className="fc-input !py-2 text-sm">
                <option value="">All courses</option>
                {courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
              </select></label>
          )}
          <label className="grid gap-1 text-xs font-medium">Period
            <select name="month" defaultValue={activeMonth ?? ""} className="fc-input !py-2 text-sm">
              <option value="">All time</option>
              {months.map((k) => <option key={k} value={k}>{monthLabel(k)}</option>)}
            </select></label>
          <button className="fc-btn fc-btn-outline !min-w-0 !px-4 !py-2 text-sm text-ink">Show</button>

        </form>

        {perCourse.length > 0 && (
          <div className="overflow-x-auto">
            <p className="mb-2 font-semibold">By Course{activeMonth ? `, ${monthLabel(activeMonth)}` : ""}</p>
            <table className="w-full min-w-[760px] text-sm tabular-nums">
              <thead className="text-left text-muted"><tr>
                <th className="py-2 font-medium">Course</th><th className="py-2 text-right font-medium">Sales</th>
                <th className="py-2 text-right font-medium">Paid (excl. tax)</th><th className="py-2 text-right font-medium">Costs taken off</th>
                <th className="py-2 text-right font-medium">Shared</th><th className="py-2 text-right font-medium">Your share</th>
                <th className="py-2 text-right font-medium">You earn</th>
              </tr></thead>
              <tbody>
                {perCourse.map((c) => (
                  <tr key={c.id} className="border-t border-line">
                    <td className="py-2.5"><a href={`${basePath}?course=${c.id}${activeMonth ? `&month=${activeMonth}` : ""}#statement`} className="underline">{c.title}</a></td>
                    <td className="py-2.5 text-right">{c.sales}</td>
                    <td className="py-2.5 text-right">{m(c.paid)}</td>
                    <td className="py-2.5 text-right text-muted">{c.fee + c.partner + c.cashback ? `−${m(c.fee + c.partner + c.cashback)}` : "–"}</td>
                    <td className="py-2.5 text-right">{m(c.shared)}</td>
                    <td className="py-2.5 text-right">{c.share != null ? `${c.share}%` : "–"}</td>
                    <td className="py-2.5 text-right font-semibold">{m(c.earned)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr className="border-t-2 border-ink font-semibold">
                <td className="py-2.5">Total</td><td className="py-2.5 text-right">{t.sales}</td><td className="py-2.5 text-right">{m(t.paid)}</td>
                <td className="py-2.5 text-right">{t.fee + t.partner + t.cashback ? `−${m(t.fee + t.partner + t.cashback)}` : "–"}</td>
                <td className="py-2.5 text-right">{m(t.shared)}</td><td /><td className="py-2.5 text-right">{m(t.earned)}</td>
              </tr></tfoot>
            </table>
          </div>
        )}

        {/* the waterfall for the chosen course and period */}
        <div className="grid gap-1 rounded-xl bg-surface p-4 tabular-nums">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted">Summary · {scope} · {t.sales} {t.sales === 1 ? "sale" : "sales"}</p>
          <div className="flex justify-between gap-4"><span>Gross Revenue</span><b>{m(t.paid)}</b></div>
          <div className="flex justify-between gap-4 text-muted"><span>&minus; Gateway Fees</span><span>{m(t.fee)}</span></div>
          <div className="flex justify-between gap-4 text-muted"><span>&minus; Partner Commissions</span><span>{m(t.partner)}</span></div>
          <div className="flex justify-between gap-4 text-muted"><span>&minus; Cashback Deduction</span><span>{m(t.cashback)}</span></div>
          <div className="mt-1 flex justify-between gap-4 border-t border-line pt-2"><span>= Shared Amount</span><b>{m(t.shared)}</b></div>
          <div className="flex justify-between gap-4 text-muted"><span>&times; Revenue Share</span><span>{shareText ?? "per course, above"}</span></div>
          <div className="mt-1 flex justify-between gap-4 border-t-2 border-ink pt-2 text-base"><b>= Your Earnings</b><b>{m(t.earned)}</b></div>
        </div>

        <details className="rounded-xl border border-line p-4">
          <summary className="cursor-pointer font-semibold">How Each Figure Is Worked Out</summary>
          <ul className="mt-3 grid list-disc gap-1.5 pl-5 text-muted">
            <li><b className="text-ink">Gross Revenue:</b> the course price after any discount code and any FinCoursa credit the student used, excluding tax. A programme&apos;s price is split equally across its courses.</li>
            <li><b className="text-ink">Gateway Fees:</b> the card and payment gateway fee on the sale, at the standard rate shown on each sale. No fee on free enrolments.</li>
            <li><b className="text-ink">Partner Commissions:</b> only when the student came through a FinCoursa partner&apos;s referral link or code.</li>
            <li><b className="text-ink">Cashback Deduction:</b> the FinCoursa credit a student receives for buying (and for a review, during offers that include it). Part of it counts as a cost of the sale and is taken off before the share (the % is shown on each sale); FinCoursa carries the rest.</li>
            <li><b className="text-ink">Your Earnings:</b> the Shared Amount &times; your revenue share, never below zero. Earnings become payable 30 days after the sale, once the refund window has passed. A refunded sale is cancelled.</li>
            <li>Student names and contact details are never shown.</li>
          </ul>
        </details>

        {!rows.length ? <p className="text-muted">{earnings.length ? "No sales in this period." : "No sales yet. Each sale will appear here with its full calculation."}</p> : (
          <div className="overflow-x-auto">
            <p className="mb-2 font-semibold">Every Sale</p>
            <table className="w-full min-w-[860px] text-sm tabular-nums">
              <thead className="text-left text-muted"><tr>
                <th className="py-2 font-medium">Date</th><th className="py-2 font-medium">Course</th>
                <th className="py-2 text-right font-medium">Paid (excl. tax)</th><th className="py-2 text-right font-medium">Payment fee</th>
                <th className="py-2 text-right font-medium">Partner</th><th className="py-2 text-right font-medium">Cashback</th>
                <th className="py-2 text-right font-medium">Shared</th><th className="py-2 text-right font-medium">Share</th>
                <th className="py-2 text-right font-medium">You earn</th><th className="py-2 pl-4 font-medium">Status</th>
              </tr></thead>
              <tbody>
                {rows.map((e) => {
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
                      <td className="py-2.5 text-right text-muted">{f(e.cashback_minor)}{Number(e.cashback_given_minor) > 0 && Number(e.cashback_counted_pct) < 100 && <span className="block text-xs">{Number(e.cashback_counted_pct)}% of {formatMoney(e.cashback_given_minor, e.currency)}</span>}</td>
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
                <td className="py-2.5 text-right">{m(t.paid)}</td><td className="py-2.5 text-right">{t.fee ? `−${m(t.fee)}` : "–"}</td>
                <td className="py-2.5 text-right">{t.partner ? `−${m(t.partner)}` : "–"}</td><td className="py-2.5 text-right">{t.cashback ? `−${m(t.cashback)}` : "–"}</td>
                <td className="py-2.5 text-right">{m(t.shared)}</td><td />
                <td className="py-2.5 text-right">{m(t.earned)}</td><td />
              </tr></tfoot>
            </table>
          </div>
        )}
      </div>
    </Card>
  );
}
