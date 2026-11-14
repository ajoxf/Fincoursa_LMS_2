import type { Metadata } from "next";
import { env } from "@/lib/env";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurriculum } from "@/lib/course-admin";
import { syncPendingVideos } from "@/lib/mux";
import { Card } from "@/components/dash/Stat";
import { CourseBuilder } from "@/components/dash/CourseBuilder";
import { CourseDetailsForm } from "./CourseDetailsForm";
import { Announcements } from "./Announcements";
import { formatDate } from "@/lib/format";
import { addCourseInstructor, deleteCourse, removeCourseInstructor, setCourseStatus } from "../actions";
import { PricingEditor, type PriceRow } from "./PricingEditor";

export const metadata: Metadata = { title: "Edit course" };


export default async function EditCoursePage({ params }: PageProps<"/admin/courses/[id]">) {
  const { id } = await params;
  await requireRole(["admin"], `/admin/courses/${id}`);
  await syncPendingVideos(id).catch(() => {});
  const db = createAdminClient();
  const [{ data: course }, { data: categories }, { data: instructors }, chapters, { data: enrolled }, { data: tagRows }] = await Promise.all([
    db.from("courses").select("*, prices(*), course_instructors(instructor_id, is_primary, revenue_share_pct, instructor:instructors(name, default_revenue_share_pct))").eq("id", id).maybeSingle(),
    db.from("categories").select("id, name").order("sort_order"),
    db.from("instructors").select("id, name").order("sort_order"),
    getCurriculum(id),
    db.from("enrollments").select("progress_pct, completed_at").eq("course_id", id).is("revoked_at", null),
    db.from("courses").select("tags"),
  ]);
  const { data: taxRows } = await db.from("tax_rates").select("country_code, name, rate, prices_include_tax").eq("is_active", true);
  const taxes = (taxRows ?? []).map((t) => ({ ...t, rate: Number(t.rate) }));
  const { data: news } = await db.from("course_announcements")
    .select("id, title, body, created_at, campaign:email_campaigns(sent, total, status)").eq("course_id", id).order("created_at", { ascending: false }).limit(20);
  const allTags = Array.from(new Set((tagRows ?? []).flatMap((r: { tags: string[] | null }) => r.tags ?? []))).sort();
  if (!course) notFound();
  const prices: PriceRow[] = (course.prices ?? []).filter((p: { is_active: boolean }) => p.is_active);
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
        <CourseDetailsForm course={course} categories={categories ?? []} allTags={allTags} />
      </Card>

      <Card title="2 · Pricing">
        <PricingEditor courseId={id} prices={prices} taxes={taxes} defaultCurrency={env.defaultCurrency} />
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

      {/* optional: closed unless there are updates already */}
      <details className="fc-card group min-w-0 p-5" open={(news ?? []).length > 0}>
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4">
          <span>
            <span className="font-semibold text-primary">Updates to enrolled students</span>
            <span className="ml-2 text-sm text-muted">optional{(news ?? []).length ? ` · ${(news ?? []).length} posted` : ""}</span>
          </span>
          <span className="text-sm underline group-open:hidden">Post an update</span>
          <span className="hidden text-sm underline group-open:inline">Hide</span>
        </summary>
        <p className="mb-4 mt-3 text-sm text-muted">Only if you need it: a short note shown at the top of the course and on each student&apos;s dashboard, and emailed if you tick the box. Use it for new lessons, changed session times or new resources.</p>
        <Announcements courseId={id} enrolled={students} items={(news ?? []).map((a) => {
          /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
          const c = (Array.isArray(a.campaign) ? a.campaign[0] : a.campaign) as any;
          return { id: a.id, title: a.title, body: a.body, created_at: formatDate(a.created_at, "long"), emailed: c ? `emailed to ${c.sent} of ${c.total}` : null };
        })} />
      </details>

      {course.status === "draft" && (
        <form action={deleteCourse.bind(null, id)} className="text-right">
          <button className="text-sm text-danger underline">Delete this draft course</button>
        </form>
      )}
    </div>
  );
}

