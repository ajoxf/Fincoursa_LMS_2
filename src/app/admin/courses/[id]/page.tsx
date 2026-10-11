import type { Metadata } from "next";
import { env } from "@/lib/env";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurriculum } from "@/lib/course-admin";
import { syncPendingVideos } from "@/lib/mux";
import { formatMoney, minorUnitsFactor } from "@/lib/money";
import { Card } from "@/components/dash/Stat";
import { CourseBuilder } from "@/components/dash/CourseBuilder";
import { CourseDetailsForm } from "./CourseDetailsForm";
import { addCourseInstructor, archivePrice, deleteCourse, removeCourseInstructor, savePrice, setCourseStatus } from "../actions";

export const metadata: Metadata = { title: "Edit course" };

const PRICE_TYPES = [
  { id: "one_time", label: "One-time payment" },
  { id: "payment_plan", label: "Payment plan" },
  { id: "subscription", label: "Subscription" },
];

export default async function EditCoursePage({ params }: PageProps<"/admin/courses/[id]">) {
  const { id } = await params;
  await requireRole(["admin"], `/admin/courses/${id}`);
  await syncPendingVideos(id).catch(() => {});
  const db = createAdminClient();
  const [{ data: course }, { data: categories }, { data: instructors }, chapters, { data: enrolled }] = await Promise.all([
    db.from("courses").select("*, prices(*), course_instructors(instructor_id, is_primary, revenue_share_pct, instructor:instructors(name, default_revenue_share_pct))").eq("id", id).maybeSingle(),
    db.from("categories").select("id, name").order("sort_order"),
    db.from("instructors").select("id, name").order("sort_order"),
    getCurriculum(id),
    db.from("enrollments").select("progress_pct, completed_at").eq("course_id", id).is("revoked_at", null),
  ]);
  if (!course) notFound();
  const prices = (course.prices ?? []).filter((p: { is_active: boolean }) => p.is_active);
  const lessons = chapters.reduce((n, c) => n + c.lessons.length, 0);
  const students = enrolled?.length ?? 0;
  const completionRate = students ? Math.round((enrolled!.filter((e) => e.completed_at).length / students) * 100) : 0;
  const avgProgress = students ? Math.round(enrolled!.reduce((n, e) => n + Number(e.progress_pct), 0) / students) : 0;
  const statusStyle: Record<string, string> = { draft: "bg-warning/15 text-warning", published: "bg-success/15 text-success", archived: "bg-line text-muted" };

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/admin/courses" className="text-sm text-muted hover:underline">← All courses</Link>
          <h1 className="mt-2 text-3xl font-bold text-primary">{course.title}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-3 text-sm text-muted">
            <span className={`rounded-button px-2 py-0.5 text-xs font-semibold ${statusStyle[course.status]}`}>{course.status}</span>
            <span>{lessons} lessons · {students ?? 0} students</span>
            <Link href={`/courses/${course.slug}`} className="underline">View course page</Link>
            <Link href={`/instructor/courses/${id}`} className="underline">Progress analytics</Link>
          </p>
        </div>
        <form className="flex flex-wrap gap-2">
          <Link href={`/learn/${course.slug}`} className="fc-btn fc-btn-outline !min-w-0">Preview</Link>
          {course.status !== "published" && <button formAction={setCourseStatus.bind(null, id, "published")} className="fc-btn fc-btn-primary">Publish</button>}
          {course.status === "published" && <button formAction={setCourseStatus.bind(null, id, "draft")} className="fc-btn fc-btn-outline">Unpublish</button>}
          {course.status !== "archived" && <button formAction={setCourseStatus.bind(null, id, "archived")} className="fc-btn fc-btn-outline">Archive</button>}
        </form>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {[[String(students), "Enrollments"], [`${completionRate}%`, "Completion rate"], [`${avgProgress}%`, "Average progress"]].map(([v, l]) => (
          <div key={l} className="fc-card p-6"><p className="text-3xl tabular-nums text-ink">{v}</p><p className="mt-2 text-lg font-medium text-ink">{l}</p></div>
        ))}
      </div>

      <Card title="1 · Course details">
        <CourseDetailsForm course={course} categories={categories ?? []} />
      </Card>

      <Card title="2 · Pricing">
        <div className="grid gap-3">
          {prices.map((p: { id: string; type: string; currency: string; amount_minor: number; compare_at_minor: number | null; installments: number | null; interval: string | null }) => (
            <form key={p.id} action={savePrice.bind(null, id, p.id)} className="grid items-end gap-2 rounded-md border border-line p-3 sm:grid-cols-[1fr_90px_120px_120px_auto]">
              <PriceFields p={p} />
              <div className="flex gap-2">
                <button className="fc-btn fc-btn-dark !px-4 !py-2 text-sm">Save</button>
                <button formAction={archivePrice.bind(null, id, p.id)} className="text-xs text-danger underline">Remove</button>
              </div>
              <p className="text-xs text-muted sm:col-span-5">
                {p.amount_minor === 0 ? "Free — students enrol without checkout." : `${formatMoney(p.amount_minor, p.currency)} ${p.type === "payment_plan" ? `in ${p.installments} instalments` : p.type === "subscription" ? `per ${p.interval}` : "one-time"}, VAT included for UAE buyers.`}
              </p>
            </form>
          ))}
          <details className="rounded-md border border-dashed border-line p-3">
            <summary className="cursor-pointer text-sm font-medium">+ Add a price (e.g. another currency)</summary>
            <form action={savePrice.bind(null, id, null)} className="mt-3 grid items-end gap-2 sm:grid-cols-[1fr_90px_120px_120px_auto]">
              <PriceFields p={null} />
              <button className="fc-btn fc-btn-dark !px-4 !py-2 text-sm">Add price</button>
            </form>
          </details>
          <p className="text-xs text-muted">Set the amount to 0 to make the course free. Payment plans and subscriptions need a gateway that supports them.</p>
        </div>
      </Card>

      <Card title="3 · Instructors & revenue share">
        <ul className="divide-y divide-line text-sm">
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          {(course.course_instructors ?? []).map((ci: any) => (
            <li key={ci.instructor_id} className="flex flex-wrap items-center justify-between gap-3 py-2">
              <span className="font-medium">{ci.instructor?.name}{ci.is_primary && <span className="ml-2 text-xs text-muted">primary</span>}</span>
              <span className="flex items-center gap-4">
                <span>{ci.revenue_share_pct ?? ci.instructor?.default_revenue_share_pct ?? 0}% of net revenue{ci.revenue_share_pct == null && <span className="text-muted"> (their default)</span>}</span>
                <form action={removeCourseInstructor.bind(null, id, ci.instructor_id)}><button className="text-xs text-danger underline">Remove</button></form>
              </span>
            </li>
          ))}
          {!course.course_instructors?.length && <li className="py-2 text-muted">No instructor assigned.</li>}
        </ul>
        <form action={addCourseInstructor.bind(null, id)} className="mt-4 flex flex-wrap items-end gap-2">
          <label className="grid gap-1 text-sm font-medium">Instructor
            <select name="instructor_id" required className="fc-input min-w-56"><option value="">Choose…</option>{(instructors ?? []).map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</select>
          </label>
          <label className="grid gap-1 text-sm font-medium">Revenue share %
            <input name="share" type="number" min={0} max={100} step="0.5" placeholder="default" className="fc-input w-28" />
          </label>
          <button className="fc-btn fc-btn-dark !py-2.5">Add / update</button>
          <Link href="/admin/instructors" className="pb-2 text-sm underline">Manage instructors</Link>
        </form>
      </Card>

      <Card title="4 · Curriculum">
        <CourseBuilder courseId={id} chapters={chapters} />
      </Card>

      {course.status === "draft" && (
        <form action={deleteCourse.bind(null, id)} className="text-right">
          <button className="text-sm text-danger underline">Delete this draft course</button>
        </form>
      )}
    </div>
  );
}

function PriceFields({ p }: { p: { type: string; currency: string; amount_minor: number; compare_at_minor: number | null; installments: number | null; interval: string | null } | null }) {
  const cur = p?.currency ?? env.defaultCurrency;
  const f = minorUnitsFactor(cur);
  return (
    <>
      <label className="grid gap-1 text-xs font-medium">Type
        <select name="type" defaultValue={p?.type === "free" ? "one_time" : p?.type ?? "one_time"} className="fc-input !py-2">
          {PRICE_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
      </label>
      <label className="grid gap-1 text-xs font-medium">Currency<input name="currency" defaultValue={cur} maxLength={3} className="fc-input !py-2 uppercase" /></label>
      <label className="grid gap-1 text-xs font-medium">Price<input name="amount" type="number" min={0} step="0.01" defaultValue={p ? p.amount_minor / f : ""} required className="fc-input !py-2" /></label>
      <label className="grid gap-1 text-xs font-medium">Was (optional)<input name="compare_at" type="number" min={0} step="0.01" defaultValue={p?.compare_at_minor ? p.compare_at_minor / f : ""} className="fc-input !py-2" /></label>
      <input type="hidden" name="installments" value={p?.installments ?? 3} />
      <input type="hidden" name="interval" value={p?.interval ?? "month"} />
    </>
  );
}
