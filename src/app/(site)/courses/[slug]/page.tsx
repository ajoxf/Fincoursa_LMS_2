import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCourse } from "@/lib/catalog";
import { getSessionUser } from "@/lib/auth";
import { getEnrollment } from "@/lib/learning";
import { formatMoney } from "@/lib/money";
import { enrollFree } from "@/app/actions/enroll";
import { PageHero, Chips } from "@/components/site/PageHero";
import { FacultyBanner } from "@/components/site/FacultyBanner";

export async function generateMetadata({ params }: PageProps<"/courses/[slug]">): Promise<Metadata> {
  const course = await getCourse((await params).slug);
  return course ? { title: course.title, description: course.description ?? undefined } : {};
}

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

function lessonSummary(lessons: { type: string }[]) {
  const n = lessons.length;
  if (n > 0 && lessons.every((l) => l.type === "video")) return `${n} Video lessons`;
  return plural(n, "lesson");
}

export default async function CoursePage({ params }: PageProps<"/courses/[slug]">) {
  const { slug } = await params;
  const course = await getCourse(slug);
  if (!course) notFound();
  const user = await getSessionUser();
  const enrollment = user ? await getEnrollment(course.id) : null;
  const lessonCount = course.chapters.reduce((n, ch) => n + ch.lessons.length, 0);
  const progress = enrollment ? Number(enrollment.progress_pct) : 0;

  const cta = enrollment ? (
    <Link href={`/learn/${course.slug}`} className="fc-btn fc-btn-primary w-full !py-4">
      {progress >= 100 ? "Review Course" : progress > 0 ? "Resume Course" : "Start Course"}
    </Link>
  ) : course.isFree ? (
    <form action={enrollFree.bind(null, course.id, course.slug)}>
      <button className="fc-btn fc-btn-primary w-full !py-4">Enroll for Free</button>
    </form>
  ) : (
    <Link href={`/checkout?course=${course.slug}`} className="fc-btn fc-btn-primary w-full !py-4">Enroll Now</Link>
  );

  return (
    <>
      <PageHero label="Courses" title={course.title}
        aside={
          <div className="w-full md:min-w-[230px] md:text-right">
            {course.price?.compare_at_minor && !course.isFree && (
              <p className="text-lg text-white/50 line-through">{formatMoney(course.price.compare_at_minor, course.price.currency)}</p>
            )}
            <p className={`whitespace-nowrap font-bold tracking-tight ${course.isFree ? "text-5xl md:text-[64px]" : "text-4xl md:text-[52px]"}`}>
              {course.isFree ? "Free" : course.price && formatMoney(course.price.amount_minor, course.price.currency)}
            </p>
            <p className="mt-3 text-[15px]">{course.access_days ? `${course.access_days} days access` : "Full lifetime access"}</p>
            <div className="mt-5 md:ml-auto md:w-[210px]">{cta}</div>
          </div>
        }>
        {course.description && <p className="mt-6 max-w-[560px] text-[15px] leading-relaxed">{course.description}</p>}
        <Chips items={[course.level ?? "All Levels", plural(lessonCount, "lesson"), "Self-paced"]} />
      </PageHero>

      <section className="bg-surface">
        <div className="fc-container pb-24 pt-20">
          <div className="mx-auto max-w-[968px]">
            {(course.subtitle || course.description) && (
              <p className="text-2xl font-light leading-snug tracking-tight text-ink md:text-[26px]">{course.subtitle || course.description}</p>
            )}
            <p className="mt-24 text-sm font-medium uppercase tracking-[0.14em] text-ink">
              Course content · {plural(course.chapters.length, "module")} · {plural(lessonCount, "lesson")}
            </p>
            <div className="mt-6 grid gap-2">
              {course.chapters.map((ch, i) => (
                <details key={ch.id} className="group rounded-lg bg-white">
                  <summary className="flex cursor-pointer list-none items-center gap-10 px-5 py-5 text-[15px] text-ink">
                    <span className="w-6 text-ink/80">{String(i + 1).padStart(2, "0")}</span>
                    <span className="flex-1">{ch.title}</span>
                    <span className="text-ink/80">{lessonSummary(ch.lessons)}</span>
                  </summary>
                  <ul className="border-t border-line px-5 py-3 pl-[76px] text-sm">
                    {ch.lessons.map((l) => (
                      <li key={l.id} className="flex items-center justify-between gap-4 py-2">
                        <span className="flex items-center gap-3">
                          <span aria-hidden className="text-muted">{l.type === "video" ? "▶" : l.type === "quiz" ? "?" : "▤"}</span>{l.title}
                        </span>
                        <span className="flex items-center gap-4 text-muted">
                          {l.is_preview && <Link href={`/learn/${course.slug}/${l.id}`} className="font-medium text-ink underline underline-offset-4">Preview</Link>}
                          {l.duration_seconds > 0 && `${Math.ceil(l.duration_seconds / 60)} min`}
                        </span>
                      </li>
                    ))}
                  </ul>
                </details>
              ))}
            </div>
          </div>

          {course.instructors[0] && <div className="mx-auto mt-16 max-w-[1080px]"><FacultyBanner person={course.instructors[0]} /></div>}
        </div>
      </section>
    </>
  );
}
