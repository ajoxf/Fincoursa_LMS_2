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
import { loadInstructorDashboard } from "@/lib/instructor-statement";

export const metadata: Metadata = { title: "Instructor" };

const TABS = [["dashboard", "Dashboard (what they see)"], ["profile", "Edit profile"]] as const;

export default async function AdminInstructor({ params, searchParams }: PageProps<"/admin/instructors/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  await requireRole(["admin"], `/admin/instructors/${id}`);
  const tab = sp.tab === "profile" ? "profile" : "dashboard";
  const db = createAdminClient();
  const { data: ins } = await db.from("instructors").select("*, course_instructors(revenue_share_pct, course:courses(id, title))").eq("id", id).maybeSingle();
  if (!ins) notFound();
  const { data: login } = ins.user_id ? await db.from("profiles").select("email, created_at").eq("id", ins.user_id).maybeSingle() : { data: null };
  const days = Math.min(365, Math.max(7, Number(sp.days) || 30));
  const base = `/admin/instructors/${id}`;
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  const links = (ins.course_instructors ?? []) as any[];
  const photo = ins.photo_url ? assetUrl(ins.photo_url) : null;

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
            <span>Default share: {Number(ins.default_revenue_share_pct)}%</span>
          </p>
          <p className="mt-1 text-sm text-muted">
            Courses: {links.length ? links.map((l) => `${l.course?.title}${l.revenue_share_pct != null ? ` (${Number(l.revenue_share_pct)}%)` : ""}`).join(" · ") : "none yet"}
          </p>
          {ins.bio && <p className="mt-3 line-clamp-3 max-w-3xl text-sm text-ink/80">{ins.bio}</p>}
        </div>
        {ins.slug && <a href={`/instructors/${ins.slug}`} target="_blank" rel="noreferrer" className="fc-btn fc-btn-outline !min-w-0 !px-4 !py-2 text-sm text-ink">View public profile ↗</a>}
      </div>

      <nav className="flex flex-wrap gap-2">
        {TABS.map(([v, l]) => (
          <a key={v} href={`${base}?tab=${v}`} className={`rounded-full px-4 py-1.5 text-sm ${tab === v ? "bg-ink text-white" : "bg-surface"}`}>{l}</a>
        ))}
      </nav>

      {tab === "dashboard" ? (
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
