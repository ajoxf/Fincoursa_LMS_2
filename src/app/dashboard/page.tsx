import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Stat, Progress } from "@/components/dash/Stat";
import { formatDate } from "@/lib/format";
import { announcementsFor } from "@/lib/announcements";
import { CourseUpdatesList } from "@/components/player/CourseUpdates";
import { assetUrl, isThinkificAsset } from "@/lib/assets";

/* eslint-disable @typescript-eslint/no-explicit-any */
/** Course artwork, or the lead instructor's photo when a course has none (old Thinkific links don't load). */
function courseImage(course: any): string | null {
  const ok = (u?: string | null) => (u && !isThinkificAsset(u) ? u : null);
  const lead = (course?.course_instructors ?? []).find((ci: any) => ci.is_primary) ?? course?.course_instructors?.[0];
  return ok(course?.thumbnail_url) ?? ok(lead?.instructor?.photo_url);
}

function Thumb({ course, className = "" }: { course: any; className?: string }) {
  const src = courseImage(course);
  return (
    <div className={`relative overflow-hidden bg-[#1a1410] ${className}`}>
      {src
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={assetUrl(src)} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover object-[70%_20%]" />
        : (
          // no artwork yet: a branded tile with the course name (admin can upload an image in Courses)
          <div className="absolute inset-0 flex flex-col justify-between bg-gradient-to-br from-black via-[#151a12] to-[#2b3510] p-4">
            <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#d6fd3b]">FinCoursa</span>
            <span className="line-clamp-2 text-base font-medium leading-snug text-white">{course?.title}</span>
          </div>
        )}
    </div>
  );
}

export const metadata: Metadata = { title: "My courses" };

export default async function StudentDashboard({ searchParams }: PageProps<"/dashboard">) {
  const user = await requireUser("/dashboard");
  const denied = (await searchParams).denied;
  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("enrollments")
    .select("id, course_id, progress_pct, completed_at, last_activity_at, expires_at, revoked_at, course:courses(slug, title, thumbnail_url, duration_minutes, course_instructors(is_primary, instructor:instructors(photo_url)))")
    .eq("user_id", user.id)
    .is("revoked_at", null)
    .order("last_activity_at", { ascending: false, nullsFirst: false });
  const { count: certs } = await supabase.from("certificates").select("id", { count: "exact", head: true }).eq("user_id", user.id);

  const enrollments = (rows ?? []).filter((e: any) => e.course && (!e.expires_at || new Date(e.expires_at) > new Date())) as any[];
  const inProgress = enrollments.filter((e) => !e.completed_at);
  const done = enrollments.filter((e) => e.completed_at);
  const resume = inProgress.find((e) => Number(e.progress_pct) > 0) ?? inProgress[0];
  const updates = await announcementsFor(enrollments.map((e) => e.course_id), 5);

  return (
    <div className="grid gap-8">
      {denied && <p className="rounded-card bg-warning/10 p-4 text-sm text-warning">You don&apos;t have access to that page.</p>}
      <div>
        <h1 className="text-3xl font-bold text-primary">Welcome back{user.fullName ? `, ${user.fullName.split(" ")[0]}` : ""}</h1>
        {resume && (
          <div className="fc-card mt-6 flex flex-col gap-4 overflow-hidden p-6 md:flex-row md:items-center md:justify-between md:p-5">
            <Thumb course={resume.course} className="hidden aspect-[4/3] w-40 shrink-0 rounded-lg md:block" />
            <div className="min-w-0 flex-1">
              <p className="text-sm text-muted">Pick up where you left off</p>
              <p className="mt-1 text-lg font-semibold">{resume.course.title}</p>
              <div className="mt-3 max-w-md"><Progress pct={Number(resume.progress_pct)} /></div>
            </div>
            <Link href={`/learn/${resume.course.slug}`} className="fc-btn fc-btn-primary">Continue</Link>
          </div>
        )}
      </div>

      <div className={`grid gap-4 ${certs ? "grid-cols-2 md:grid-cols-4" : "grid-cols-3"}`}>
        <Stat label="Enrolled" value={enrollments.length} />
        <Stat label="In progress" value={inProgress.length} />
        <Stat label="Completed" value={done.length} />
        {certs ? <Stat label="Certificates" value={certs} /> : null}
      </div>

      <CourseUpdatesList items={updates} name={user.fullName} />

      <section>
        <h2 className="text-xl font-semibold text-primary">My courses</h2>
        {enrollments.length === 0 ? (
          <div className="fc-card mt-4 p-8 text-center">
            <p className="text-muted">You haven&apos;t enrolled in a course yet.</p>
            <Link href="/pages/paid-courses" className="fc-btn fc-btn-primary mt-4">Browse Course</Link>
          </div>
        ) : (
          <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {enrollments.map((e) => (
              <Link key={e.id} href={`/learn/${e.course.slug}`} className="fc-card flex flex-col overflow-hidden hover:shadow-md">
                <Thumb course={e.course} className="aspect-[16/9] w-full" />
                <div className="flex flex-1 flex-col gap-3 p-5">
                <p className="font-semibold">{e.course.title}</p>
                <Progress pct={Number(e.progress_pct)} />
                <p className="mt-auto text-xs text-muted">
                  {e.completed_at ? `Completed ${formatDate(e.completed_at)}` :
                    e.last_activity_at ? `Last studied ${formatDate(e.last_activity_at)}` : "Not started"}
                  {e.expires_at && ` · Access until ${formatDate(e.expires_at)}`}
                </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
