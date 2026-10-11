import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatMoney } from "@/lib/money";
import { ALL_COUNTRIES, countryName, formatDate, nowMs } from "@/lib/format";
import { Card, Progress, Stat } from "@/components/dash/Stat";
import { grantCourse, removeAccess, restoreAccess, setAccessUntil, updateStudentProfile } from "../actions";

export const metadata: Metadata = { title: "Student" };

const statusLabel: Record<string, string> = { paid: "Paid", pending: "Pending", failed: "Failed", cancelled: "Cancelled", refunded: "Refunded", partially_refunded: "Partly refunded" };
const sourceLabel: Record<string, string> = { purchase: "Bought", bundle: "Bundle", free: "Free", admin: "Given by staff", organization: "Organisation", migration: "From Thinkific" };

/* eslint-disable @typescript-eslint/no-explicit-any */
export default async function StudentPage({ params }: PageProps<"/admin/students/[id]">) {
  const me = await requireRole(["admin", "finance", "support"], "/admin/students");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const db = createAdminClient();
  const [{ data: s }, { data: enr }, { data: orders }, { data: certs }, { data: courses }] = await Promise.all([
    db.from("admin_students").select("*").eq("id", id).maybeSingle(),
    db.from("enrollments").select("id, course_id, source, enrolled_at, expires_at, revoked_at, progress_pct, completed_at, last_activity_at, course:courses(title, slug)")
      .eq("user_id", id).order("enrolled_at", { ascending: false }),
    db.from("orders").select("id, number, status, currency, total_minor, refunded_minor, created_at, paid_at, gateway, order_items(title)")
      .eq("user_id", id).order("created_at", { ascending: false }),
    db.from("certificates").select("id, serial, issued_at, course:courses(title)").eq("user_id", id).order("issued_at", { ascending: false }),
    db.from("courses").select("id, title, status").neq("status", "archived").order("sort_order"),
  ]);
  if (!s) notFound();
  const canEdit = me.roles.includes("admin") || me.roles.includes("support");
  const now = nowMs();
  const active = (enr ?? []).filter((e: any) => !e.revoked_at && (!e.expires_at || new Date(e.expires_at).getTime() > now));
  const has = new Set(active.map((e: any) => e.course_id));
  const spent: Record<string, number> = {};
  for (const o of orders ?? []) if (["paid", "partially_refunded", "refunded"].includes(o.status)) spent[o.currency] = (spent[o.currency] ?? 0) + o.total_minor - (o.refunded_minor ?? 0);
  const spentText = Object.entries(spent).filter(([, v]) => v > 0).map(([c, v]) => formatMoney(v, c)).join(" · ") || "—";
  const today = new Date(now).toISOString().slice(0, 10);

  return (
    <div className="grid gap-6">
      <div>
        <Link href="/admin/students" className="text-sm text-muted hover:underline">← All students</Link>
        <h1 className="mt-2 text-3xl font-bold text-primary">{s.full_name || s.email}</h1>
        <p className="mt-1 text-sm text-muted">
          <a href={`mailto:${s.email}`} className="underline">{s.email}</a>
          {s.country_code && ` · ${countryName(s.country_code)}`} · joined {formatDate(s.created_at, "long")}
          {s.last_sign_in_at && ` · last signed in ${formatDate(s.last_sign_in_at)}`}
        </p>
        <div className="mt-2 flex flex-wrap gap-2 text-xs">
          {(s.roles ?? []).map((r: string) => <span key={r} className="rounded-full bg-surface px-2.5 py-0.5 capitalize">{r}</span>)}
          <span className={`rounded-full px-2.5 py-0.5 ${s.marketing_opt_in ? "bg-success/15 text-success" : "bg-surface text-muted"}`}>
            {s.marketing_opt_in ? "Agreed to marketing emails" : "No marketing emails"}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Courses with access" value={active.length} />
        <Stat label="Completed" value={s.completed_courses} />
        <Stat label="Total spent" value={<span className="text-xl">{spentText}</span>} hint="after refunds" />
        <Stat label="Last studied" value={<span className="text-xl">{s.last_activity_at ? formatDate(s.last_activity_at) : "—"}</span>} />
      </div>

      <Card title="Courses">
        {!(enr ?? []).length ? <p className="text-sm text-muted">Not enrolled in any course yet.</p> : (
          <ul className="divide-y divide-line">
            {(enr ?? []).map((e: any) => {
              const expired = e.expires_at && new Date(e.expires_at).getTime() <= now;
              const state = e.revoked_at ? { t: "Access removed", c: "text-danger" } : expired ? { t: `Expired ${formatDate(e.expires_at)}`, c: "text-warning" }
                : e.expires_at ? { t: `Access until ${formatDate(e.expires_at)}`, c: "text-ink" } : { t: "Lifetime access", c: "text-ink" };
              return (
                <li key={e.id} className="grid gap-3 py-4 md:grid-cols-[1.4fr_1fr_1fr] md:items-center">
                  <div className="min-w-0">
                    <Link href={`/courses/${e.course?.slug}`} className="font-medium text-ink hover:underline">{e.course?.title}</Link>
                    <p className="text-xs text-muted">{sourceLabel[e.source] ?? e.source} · enrolled {formatDate(e.enrolled_at)}{e.last_activity_at ? ` · last studied ${formatDate(e.last_activity_at)}` : ""}</p>
                  </div>
                  <div>
                    <Progress pct={Number(e.progress_pct)} />
                    {e.completed_at && <p className="mt-1 text-xs text-success">Completed {formatDate(e.completed_at)}</p>}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm md:justify-end">
                    <span className={state.c}>{state.t}</span>
                    {canEdit && (
                      <details className="relative">
                        <summary className="cursor-pointer list-none text-sm underline">Change…</summary>
                        <div className="absolute left-0 z-10 mt-2 grid w-64 gap-3 rounded-card border border-line bg-white p-3 shadow-lg md:left-auto md:right-0">
                          <form action={setAccessUntil.bind(null, id, e.id)} className="grid gap-2 text-xs">
                            <label className="grid gap-1">Access until
                              <input type="date" name="until" min={today} defaultValue={e.expires_at?.slice(0, 10) ?? ""} className="fc-input !py-1.5" />
                            </label>
                            <label className="flex items-center gap-2"><input type="checkbox" name="lifetime" defaultChecked={!e.expires_at} /> Lifetime access</label>
                            <button className="rounded-md bg-ink px-3 py-1.5 text-white">Save access</button>
                          </form>
                          {e.revoked_at
                            ? <form action={restoreAccess.bind(null, id, e.id)}><button className="text-xs text-success underline">Restore access</button></form>
                            : <form action={removeAccess.bind(null, id, e.id)}><button className="text-xs text-danger underline">Remove access to this course</button></form>}
                        </div>
                      </details>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {canEdit && (
        <Card title="Give access to a course">
          <form action={grantCourse.bind(null, id)} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_auto] lg:items-end">
            <label className="grid gap-1 text-sm font-medium">Course
              <select name="course_id" required className="fc-input" defaultValue="">
                <option value="" disabled>Choose a course…</option>
                {(courses ?? []).filter((c) => !has.has(c.id)).map((c) => <option key={c.id} value={c.id}>{c.title}{c.status !== "published" ? " (draft)" : ""}</option>)}
              </select>
            </label>
            <label className="grid gap-1 text-sm font-medium">Access until (blank = lifetime)
              <input type="date" name="until" min={today} className="fc-input" />
            </label>
            <button className="fc-btn fc-btn-primary !min-w-0 !px-5 !py-2.5">Give access</button>
            <label className="flex items-center gap-2 text-sm sm:col-span-2 lg:col-span-3">
              <input type="checkbox" name="notify" defaultChecked /> Email {s.full_name?.split(" ")[0] || "them"} a link to the course
            </label>
          </form>
          <p className="mt-3 text-xs text-muted">No payment is taken. Use this for scholarships, support cases or corporate seats. Every change is logged.</p>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Orders">
          {!(orders ?? []).length ? <p className="text-sm text-muted">No orders.</p> : (
            <ul className="divide-y divide-line text-sm">
              {(orders ?? []).map((o: any) => (
                <li key={o.id} className="flex flex-wrap items-baseline justify-between gap-2 py-3">
                  <span className="min-w-0">
                    <a href={`/api/invoices/${o.id}`} className="font-medium underline">#{o.number}</a> · {o.order_items?.map((i: any) => i.title).join(", ")}
                    <span className="block text-xs text-muted">{formatDate(o.paid_at ?? o.created_at)} · {statusLabel[o.status] ?? o.status} · {o.gateway}</span>
                  </span>
                  <span className="tabular-nums">{formatMoney(o.total_minor, o.currency)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Certificates">
          {!(certs ?? []).length ? <p className="text-sm text-muted">No certificates yet.</p> : (
            <ul className="divide-y divide-line text-sm">
              {(certs ?? []).map((c: any) => (
                <li key={c.id} className="flex flex-wrap justify-between gap-2 py-3">
                  <Link href={`/certificates/${c.serial}`} className="underline">{c.course?.title}</Link>
                  <span className="text-xs text-muted">{formatDate(c.issued_at)} · {c.serial}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {canEdit && (
        <Card title="Profile">
          <form action={updateStudentProfile.bind(null, id)} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_auto] lg:items-end">
            <label className="grid gap-1 text-sm font-medium">Name (as on certificates)<input name="full_name" defaultValue={s.full_name ?? ""} className="fc-input" /></label>
            <label className="grid gap-1 text-sm font-medium">Country
              <select name="country_code" defaultValue={s.country_code ?? ""} className="fc-input">
                <option value="">—</option>{ALL_COUNTRIES.map(([c, n]) => <option key={c} value={c}>{n}</option>)}
              </select>
            </label>
            <button className="fc-btn fc-btn-outline !min-w-0 !px-5 !py-2.5 text-ink">Save profile</button>
            {s.marketing_opt_in && (
              <label className="flex items-center gap-2 text-sm sm:col-span-2 lg:col-span-3">
                <input type="checkbox" name="unsubscribe" /> Unsubscribe from marketing emails (when the student asks)
              </label>
            )}
          </form>
          <p className="mt-3 text-xs text-muted">The email address is the student&apos;s login, so they change it themselves in Settings.</p>
        </Card>
      )}
    </div>
  );
}
