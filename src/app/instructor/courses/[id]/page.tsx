import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getSessionUser, hasRole, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Stat, Card } from "@/components/dash/Stat";
import { BarList } from "@/components/dash/BarList";
import { getCurriculum } from "@/lib/course-admin";

export const metadata: Metadata = { title: "Manage course" };

type LessonStat = { lesson_id: string; title: string; chapter: string; started: number; completed: number };

/** Shared by instructors (own courses) and admins: progress analytics + read-only curriculum. Editing is admin-only. */
export default async function ManageCourse({ params }: PageProps<"/instructor/courses/[id]">) {
  const { id } = await params;
  await requireUser(`/instructor/courses/${id}`);
  const user = await getSessionUser();
  const supabase = await createClient();
  const { data: report, error } = await supabase.rpc("course_progress_report", { p_course: id });
  if (error) notFound();
  const [{ data: buckets }, { data: course }, chapters] = await Promise.all([
    supabase.rpc("course_progress_buckets", { p_course: id }),
    supabase.from("courses").select("id, slug, title, status").eq("id", id).single(),
    getCurriculum(id),
  ]);
  if (!course) notFound();
  const lessons = (report.lessons ?? []) as LessonStat[];
  const enrolled = Number(report.enrolled) || 0;

  return (
    <div className="grid gap-6">
      <div>
        <Link href={hasRole(user, "admin") ? `/admin/courses/${id}` : "/instructor"} className="text-sm text-muted hover:underline">← Back</Link>
        <h1 className="mt-2 text-3xl font-bold text-primary">{course.title}</h1>
        <p className="text-sm text-muted">Status: {course.status} · <Link href={`/courses/${course.slug}`} className="underline">View page</Link></p>
      </div>
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-5">
        <Stat label="Enrolled" value={enrolled} />
        <Stat label="Active, last 7 days" value={report.active_7d} />
        <Stat label="Not started" value={report.not_started} />
        <Stat label="Average progress" value={`${report.avg_progress}%`} />
        <Stat label="Completion rate" value={`${report.completion_rate}%`} hint={`${report.completed} completed`} />
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="Students by progress">
          <BarList rows={(buckets ?? []).map((b: { bucket: string; students: number }) => ({ label: b.bucket, value: Number(b.students) }))}
            format={(n) => `${n} students`} />
        </Card>
        <Card title="Lesson completion (where students drop off)">
          <BarList empty="No lessons yet" rows={lessons.map((l) => ({
            label: l.title, value: l.completed,
            sub: enrolled ? `${Math.round((l.completed / enrolled) * 100)}%` : undefined,
          }))} format={(n) => `${n}`} />
        </Card>
      </div>
      <Card title="Curriculum">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 text-sm text-muted">
          <span>{chapters.length} chapters · {chapters.reduce((n, c) => n + c.lessons.length, 0)} lessons</span>
          {hasRole(user, "admin")
            ? <Link href={`/admin/courses/${id}`} className="fc-btn fc-btn-dark !min-w-0 !px-4 !py-2">Edit course</Link>
            : <span>Course content and publishing are managed by the FinCoursa team. Contact us to request changes.</span>}
        </div>
        <ol className="grid gap-3">
          {[...chapters].sort((a, b) => a.position - b.position).map((ch, ci) => (
            <li key={ch.id} className="rounded-card border border-line">
              <p className="border-b border-line bg-surface px-4 py-2 font-semibold"><span className="mr-2 text-xs font-medium text-muted">Chapter {ci + 1}</span>{ch.title}</p>
              <ul className="divide-y divide-line">
                {[...ch.lessons].sort((a, b) => a.position - b.position).map((l) => (
                  <li key={l.id} className="flex items-center gap-4 px-4 py-2.5 text-sm">
                    <span className="w-16 text-xs font-semibold uppercase text-muted">{l.type}</span>
                    <span className="flex-1">{l.title}</span>
                    {l.is_preview && <span className="rounded-full bg-accent px-2 py-0.5 text-xs">Free preview</span>}
                    {l.duration_seconds > 0 && <span className="text-muted">{Math.ceil(l.duration_seconds / 60)} min</span>}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}
