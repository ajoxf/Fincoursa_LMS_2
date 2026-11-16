import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { env } from "@/lib/env";
import { Card } from "@/components/dash/Stat";
import { InstructorForm } from "./InstructorForm";
import { DeleteInstructor } from "./DeleteInstructor";
import { AgreementsPanel } from "@/components/dash/AgreementsPanel";
import { agreementsFor } from "@/lib/agreements";
import { assetUrl } from "@/lib/assets";
import { InstructorDashboardView } from "@/components/dash/InstructorDashboardView";
import { loadInstructorDashboard, monthLabel } from "@/lib/instructor-statement";
import { instructorAccess, instructorBusiness, type InstructorAccess } from "@/lib/instructor-admin";
import { resendInstructorInvite } from "../actions";
import { formatDate } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { ColumnChart } from "@/components/dash/ColumnChart";

export const metadata: Metadata = { title: "Instructor" };

const TABS = [["dashboard", "Their dashboard (what they see)"], ["business", "FinCoursa view (revenue from their courses)"], ["profile", "Edit profile"]] as const;

export default async function AdminInstructor({ params, searchParams }: PageProps<"/admin/instructors/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  await requireRole(["admin"], `/admin/instructors/${id}`);
  const tab = sp.tab === "profile" || sp.tab === "business" ? sp.tab : "dashboard";
  const db = createAdminClient();
  const { data: ins } = await db.from("instructors").select("*, course_instructors(revenue_share_pct, course:courses(id, title))").eq("id", id).maybeSingle();
  if (!ins) notFound();
  const { data: login } = ins.user_id ? await db.from("profiles").select("email, created_at").eq("id", ins.user_id).maybeSingle() : { data: null };
  const days = Math.min(365, Math.max(7, Number(sp.days) || 30));
  const base = `/admin/instructors/${id}`;
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  const links = (ins.course_instructors ?? []) as any[];
  const photo = ins.photo_url ? assetUrl(ins.photo_url) : null;
  const access = await instructorAccess(db, ins.user_id);

  return (
    <div className="grid gap-6">
      <div>
        <Link href="/admin/instructors" className="text-sm text-muted hover:underline">← All instructors</Link>
      </div>

      {/* their profile, as students see it on the site */}
      <div className="fc-card flex flex-wrap items-start gap-5 p-5">
        {photo
          ? <span role="img" aria-label={`Photo of ${ins.name}`} className="h-20 w-20 shrink-0 rounded-full bg-surface bg-cover bg-center" style={{ backgroundImage: `url("${photo}")` }} />
          : <span className="flex h-20 w-20 items-center justify-center rounded-full bg-surface text-2xl font-bold text-muted">{String(ins.name).slice(0, 1)}</span>}
        <div className="min-w-0 flex-1">
          <h1 className="text-3xl font-bold text-primary">{ins.name}</h1>
          {ins.title && <p className="text-muted">{ins.title}</p>}
          <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <span>{ins.is_published ? <span className="text-success">Shown on the Instructors page</span> : <span className="text-muted">Hidden from the site</span>}{ins.coming_soon ? " · Coming soon" : ""}</span>
            <span>Login: {login?.email ?? <span className="text-warning">not linked to an account</span>}</span>
            <AccessBadge a={access} />
            <span>Default share: {Number(ins.default_revenue_share_pct)}%</span>
          </p>
          <p className="mt-1 text-sm text-muted">
            Courses: {links.length ? links.map((l) => `${l.course?.title}${l.revenue_share_pct != null ? ` (${Number(l.revenue_share_pct)}%)` : ""}`).join(" · ") : "none yet"}
          </p>
          {ins.bio && <p className="mt-3 line-clamp-3 max-w-3xl text-sm text-ink/80">{ins.bio}</p>}
        </div>
        <div className="flex flex-col items-end gap-2">
        {access.state === "invited" && (
          <form action={resendInstructorInvite.bind(null, id)}><button className="fc-btn fc-btn-primary !min-w-0 !px-4 !py-2 text-sm">Send invitation again</button></form>
        )}
        {ins.slug && <a href={`/instructors/${ins.slug}`} target="_blank" rel="noreferrer" className="fc-btn fc-btn-outline !min-w-0 !px-4 !py-2 text-sm text-ink">View public profile ↗</a>}
        </div>
      </div>
      {typeof sp.ok === "string" && <p className="rounded-lg bg-success/10 p-3 text-sm text-success">{sp.ok}</p>}
      {typeof sp.err === "string" && <p className="rounded-lg bg-danger/10 p-3 text-sm text-danger">{sp.err}</p>}

      <nav className="flex flex-wrap gap-2">
        {TABS.map(([v, l]) => (
          <a key={v} href={`${base}?tab=${v}`} className={`rounded-full px-4 py-1.5 text-sm ${tab === v ? "bg-ink text-white" : "bg-surface"}`}>{l}</a>
        ))}
      </nav>

      {tab === "business" ? (
        <BusinessTab id={id} base={base} month={typeof sp.month === "string" ? sp.month : null} course={typeof sp.course === "string" ? sp.course : null} />
      ) : tab === "dashboard" ? (
        <>
          <p className="rounded-lg bg-surface p-3 text-sm text-muted">
            This is exactly what {ins.name} sees on their instructor dashboard{login?.email ? "" : " (once their profile is linked to a login)"}. Course reports open the same pages they use.
          </p>
          <InstructorDashboardView basePath={base} instructorId={id} title="Their dashboard"
            sp={{ course: typeof sp.course === "string" ? sp.course : null, month: typeof sp.month === "string" ? sp.month : null }}
            d={await loadInstructorDashboard(db, id, env.defaultCurrency, days)} />
        </>
      ) : (
        <ProfileTab id={id} ins={ins} loginEmail={login?.email ?? null} links={links} />
      )}
    </div>
  );
}

/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
async function ProfileTab({ id, ins, loginEmail, links }: { id: string; ins: any; loginEmail: string | null; links: any[] }) {
  const db = createAdminClient();
  const [agreements, { count: earnings }, { count: payouts }] = await Promise.all([
    agreementsFor({ type: "instructor", id }),
    db.from("instructor_earnings").select("id", { count: "exact", head: true }).eq("instructor_id", id),
    db.from("payouts").select("id", { count: "exact", head: true }).eq("instructor_id", id),
  ]);
  return (
    <>
      <Card title="Profile"><InstructorForm ins={ins} loginEmail={loginEmail} /></Card>
      <Card title="Agreement">
        <AgreementsPanel party="instructor" partyId={id} items={agreements} defaultTitle="Instructor agreement" />
      </Card>
      <Card title="Courses">
        <ul className="text-sm">
          {links.map((ci) => <li key={ci.course.id} className="py-1"><Link href={`/admin/courses/${ci.course.id}`} className="underline">{ci.course.title}</Link></li>)}
          {!links.length && <li className="text-muted">Not assigned to a course yet — assign from the course editor.</li>}
        </ul>
      </Card>
      <Card title="Delete instructor">
        <DeleteInstructor id={id} name={ins.name} courses={links.length} blocked={(earnings ?? 0) + (payouts ?? 0) > 0} />
      </Card>
    </>
  );
}

/** Invited / accepted / last seen, for the profile header and the list. */
function AccessBadge({ a }: { a: InstructorAccess }) {
  if (a.state === "no_login") return <span className="text-muted">Not invited (no login email)</span>;
  if (a.state === "invited") return <span className="text-warning">Invited{a.invitedAt ? ` ${formatDate(a.invitedAt)}` : ""} · hasn&apos;t signed in yet</span>;
  return <span className="text-success">Accepted · last signed in {formatDate(a.lastSignIn, "datetime")}</span>;
}

/** FinCoursa's side: what this instructor's courses made, what they cost, what the instructor earns and what we keep. */
async function BusinessTab({ id, base, month, course }: { id: string; base: string; month: string | null; course: string | null }) {
  const cur = env.defaultCurrency;
  const courseId = course && /^[0-9a-f-]{36}$/i.test(course) ? course : null;
  const b = await instructorBusiness(createAdminClient(), id, { month, currency: cur, courseId });
  const courseTitle = courseId ? b.courseOptions.find((c) => c.id === courseId)?.title : null;
  const m = (n: number) => formatMoney(n, cur);
  const t = b.total;
  const neg = (n: number) => (n ? `−${m(n)}` : "–");
  return (
    <div className="grid gap-6">
      <form action={base} className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="tab" value="business" />
        {b.courseOptions.length > 1 && (
          <label className="grid gap-1 text-xs font-medium">Course
            <select name="course" defaultValue={courseId ?? ""} className="fc-input !py-2 text-sm">
              <option value="">All their courses</option>
              {b.courseOptions.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
            </select></label>
        )}
        <label className="grid gap-1 text-xs font-medium">Period
          <select name="month" defaultValue={month ?? ""} className="fc-input !py-2 text-sm">
            <option value="">All time</option>
            {b.months.map((k) => <option key={k} value={k}>{monthLabel(k)}</option>)}
          </select></label>
        <button className="fc-btn fc-btn-outline !min-w-0 !px-4 !py-2 text-sm text-ink">Show</button>
      </form>
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <div className="fc-card p-4"><p className="text-sm text-muted">Revenue from their courses</p><p className="mt-1 text-2xl font-bold">{m(t.revenue)}</p><p className="text-xs text-muted">{t.sales} paid · {t.free} free with a code{t.refunded ? ` · ${t.refunded} refunded` : ""}</p></div>
        <div className="fc-card p-4"><p className="text-sm text-muted">Costs (fees, partners, cashback)</p><p className="mt-1 text-2xl font-bold">{m(t.fee + t.partner + t.cashback)}</p></div>
        <div className="fc-card p-4"><p className="text-sm text-muted">Instructor&apos;s earnings</p><p className="mt-1 text-2xl font-bold">{m(t.instructor)}</p><p className="text-xs text-muted">Owed now {m(b.owed)} · paid out {m(b.paidOut)} (all time)</p></div>
        <div className="fc-card p-4"><p className="text-sm text-muted">FinCoursa keeps</p><p className={`mt-1 text-2xl font-bold ${t.kept < 0 ? "text-danger" : "text-success"}`}>{m(t.kept)}</p><p className="text-xs text-muted">{t.revenue ? `${Math.round((t.kept / t.revenue) * 100)}% of revenue` : "no revenue yet"}</p></div>
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <Card title={`Revenue${courseTitle ? ` · ${courseTitle}` : ""} · ${month ? `by day, ${monthLabel(month)}` : "by month, last 12 months"}`}>
          <ColumnChart label="Revenue" currency={cur} data={b.series.map((p) => ({ x: p.label, y: p.revenue }))} />
        </Card>
        <Card title={`FinCoursa keeps${courseTitle ? ` · ${courseTitle}` : ""} · ${month ? "by day" : "by month"}`}>
          <ColumnChart label="FinCoursa keeps" currency={cur} data={b.series.map((p) => ({ x: p.label, y: Math.max(0, p.kept) }))} />
          {b.series.some((p) => p.kept < 0) && <p className="mt-2 text-xs text-danger">Some periods made a loss (costs and instructor share above revenue); they show as zero here and in red in the table.</p>}
        </Card>
      </div>
      <Card title={`By course${courseTitle ? ` · ${courseTitle}` : ""}${month ? `, ${monthLabel(month)}` : ""}`}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm tabular-nums">
            <thead className="text-left text-muted"><tr>
              <th className="py-2 font-medium">Course</th><th className="py-2 text-right font-medium">Paid sales</th><th className="py-2 text-right font-medium">Free</th>
              <th className="py-2 text-right font-medium">Revenue (excl. tax)</th><th className="py-2 text-right font-medium">Payment fees</th>
              <th className="py-2 text-right font-medium">Partners</th><th className="py-2 text-right font-medium">Cashback given</th>
              <th className="py-2 text-right font-medium">Instructor</th><th className="py-2 text-right font-medium">FinCoursa keeps</th>
            </tr></thead>
            <tbody>
              {b.courses.map((c) => (
                <tr key={c.course_id} className="border-t border-line">
                  <td className="py-2.5">{c.title}</td><td className="py-2.5 text-right">{c.sales}</td><td className="py-2.5 text-right">{c.free}</td>
                  <td className="py-2.5 text-right">{m(c.revenue)}</td><td className="py-2.5 text-right text-muted">{neg(c.fee)}</td>
                  <td className="py-2.5 text-right text-muted">{neg(c.partner)}</td><td className="py-2.5 text-right text-muted">{neg(c.cashback)}</td>
                  <td className="py-2.5 text-right text-muted">{neg(c.instructor)}</td>
                  <td className={`py-2.5 text-right font-semibold ${c.kept < 0 ? "text-danger" : ""}`}>{m(c.kept)}</td>
                </tr>
              ))}
              {!b.courses.length && <tr><td colSpan={9} className="py-6 text-center text-muted">No courses assigned yet.</td></tr>}
            </tbody>
            <tfoot><tr className="border-t-2 border-ink font-semibold">
              <td className="py-2.5">Total</td><td className="py-2.5 text-right">{t.sales}</td><td className="py-2.5 text-right">{t.free}</td>
              <td className="py-2.5 text-right">{m(t.revenue)}</td><td className="py-2.5 text-right">{neg(t.fee)}</td><td className="py-2.5 text-right">{neg(t.partner)}</td>
              <td className="py-2.5 text-right">{neg(t.cashback)}</td><td className="py-2.5 text-right">{neg(t.instructor)}</td>
              <td className={`py-2.5 text-right ${t.kept < 0 ? "text-danger" : ""}`}>{m(t.kept)}</td>
            </tr></tfoot>
          </table>
        </div>
        <p className="mt-3 text-xs text-muted">Revenue is what students paid for these courses after codes and credit, excluding tax; refunded sales are left out. Cashback here is the full credit given to students (FinCoursa&apos;s cost), not only the part taken off before the instructor&apos;s share. Payment fees use the rate set in Admin &rarr; Instructors.</p>
      </Card>
    </div>
  );
}
