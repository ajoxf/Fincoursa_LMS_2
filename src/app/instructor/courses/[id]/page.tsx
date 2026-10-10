import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getSessionUser, hasRole, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Stat, Card } from "@/components/dash/Stat";
import { BarList } from "@/components/dash/BarList";
import { CourseBuilder } from "@/components/dash/CourseBuilder";

export const metadata: Metadata = { title: "Manage course" };

type LessonStat = { lesson_id: string; title: string; chapter: string; started: number; completed: number };

/** Shared by instructors (own courses) and admins: progress analytics + curriculum builder. */
export default async function ManageCourse({ params }: PageProps<"/instructor/courses/[id]">) {
  const { id } = await params;
  await requireUser(`/instructor/courses/${id}`);
  const user = await getSessionUser();
  const supabase = await createClient();
  const { data: report, error } = await supabase.rpc("course_progress_report", { p_course: id });
  if (error) notFound();
  const [{ data: buckets }, { data: course }] = await Promise.all([
    supabase.rpc("course_progress_buckets", { p_course: id }),
    supabase.from("courses").select("id, slug, title, status, chapters(id, title, position, lessons(id, title, type, position, is_preview, video_asset_id, video:video_assets(status), body:lesson_bodies(body)))").eq("id", id).single(),
  ]);
  if (!course) notFound();
  const lessons = (report.lessons ?? []) as LessonStat[];
  const enrolled = Number(report.enrolled) || 0;

  return (
    <div className="grid gap-6">
      <div>
        <Link href={hasRole(user, "admin") ? "/admin/courses" : "/instructor"} className="text-sm text-muted hover:underline">← Back</Link>
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
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        <CourseBuilder courseId={course.id} chapters={(course.chapters ?? []) as any} />
      </Card>
    </div>
  );
}
