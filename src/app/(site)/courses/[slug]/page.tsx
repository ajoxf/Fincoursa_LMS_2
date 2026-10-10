import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCourse, formatDuration } from "@/lib/catalog";
import { getSessionUser } from "@/lib/auth";
import { getEnrollment } from "@/lib/learning";
import { formatMoney } from "@/lib/money";
import { enrollFree } from "@/app/actions/enroll";

export async function generateMetadata({ params }: PageProps<"/courses/[slug]">): Promise<Metadata> {
  const course = await getCourse((await params).slug);
  return course ? { title: course.title, description: course.description ?? undefined } : {};
}

export default async function CoursePage({ params }: PageProps<"/courses/[slug]">) {
  const { slug } = await params;
  const course = await getCourse(slug);
  if (!course) notFound();
  const user = await getSessionUser();
  const enrollment = user ? await getEnrollment(course.id) : null;
  const lessonCount = course.chapters.reduce((n, ch) => n + ch.lessons.length, 0);

  return (
    <>
      <section className="bg-primary text-white">
        <div className="fc-container grid gap-10 py-16 lg:grid-cols-[1fr_360px]">
          <div>
            <p className="fc-label">{course.category ?? "Course"}</p>
            <h1 className="mt-2 text-4xl font-bold leading-tight">{course.title}</h1>
            {course.description && <p className="mt-4 max-w-2xl text-lg text-on-dark/85">{course.description}</p>}
            {course.instructors.map((i) => (
              <p key={i.id} className="mt-6 text-sm"><span className="font-semibold">{i.name}</span>{i.title && <span className="text-on-dark/70"> · {i.title}</span>}</p>
            ))}
          </div>
          <aside className="fc-card self-start p-6 text-ink">
            <p className="text-3xl font-bold text-primary">
              {course.isFree ? "Free" : course.price && formatMoney(course.price.amount_minor, course.price.currency)}
            </p>
            <ul className="mt-4 space-y-2 text-sm text-muted">
              <li>{lessonCount} {lessonCount === 1 ? "lesson" : "lessons"} · {formatDuration(course.duration_minutes)}</li>
              <li>{course.access_days ? `${course.access_days} days access` : "Lifetime access"}</li>
              {course.certificate_enabled && <li>Certificate of completion</li>}
            </ul>
            <div className="mt-6">
              {enrollment ? (
                <Link href={`/learn/${course.slug}`} className="fc-btn fc-btn-primary w-full">
                  {Number(enrollment.progress_pct) > 0 ? `Continue learning (${Math.round(Number(enrollment.progress_pct))}%)` : "Start course"}
                </Link>
              ) : course.isFree ? (
                <form action={enrollFree.bind(null, course.id, course.slug)}>
                  <button className="fc-btn fc-btn-primary w-full">Enroll for free</button>
                </form>
              ) : (
                <Link href={`/checkout?course=${course.slug}`} className="fc-btn fc-btn-primary w-full">Enroll now</Link>
              )}
            </div>
          </aside>
        </div>
      </section>

      <section className="fc-container py-16">
        <h2 className="text-2xl font-semibold text-primary">Curriculum</h2>
        <div className="mt-6 divide-y divide-line rounded-card border border-line">
          {course.chapters.map((ch) => (
            <div key={ch.id} className="p-5">
              <h3 className="font-semibold">{ch.title}</h3>
              <ul className="mt-3 space-y-2">
                {ch.lessons.map((l) => (
                  <li key={l.id} className="flex items-center justify-between gap-4 text-sm">
                    <span className="flex items-center gap-2">
                      <span aria-hidden className="text-muted">{l.type === "video" ? "▶" : l.type === "quiz" ? "?" : "▤"}</span>{l.title}
                    </span>
                    <span className="flex items-center gap-3 text-muted">
                      {l.is_preview && (
                        <Link href={`/learn/${course.slug}/${l.id}`} className="font-medium text-accent">Preview</Link>
                      )}
                      {l.duration_seconds > 0 && `${Math.ceil(l.duration_seconds / 60)} min`}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
