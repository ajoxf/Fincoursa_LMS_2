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
import { LocalTime } from "@/components/site/LocalTime";
import { SESSION_ZONES, sessionDay, sessionNotOver, sessionTimes } from "@/lib/format";

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
  const sessions = course.chapters.flatMap((c) => c.lessons)
    .filter((l) => l.type === "live" && l.starts_at)
    .sort((a, b) => a.starts_at!.localeCompare(b.starts_at!));
  const isLive = sessions.length > 0;
  const upcoming = sessions.filter((l) => sessionNotOver(l.starts_at!, l.live_minutes));

  const cta = enrollment ? (
    <Link href={`/learn/${course.slug}`} className="fc-btn fc-btn-primary w-full !py-4">
      {isLive && upcoming.length ? "View session details" : progress >= 100 ? "Review Course" : progress > 0 ? "Resume Course" : "Start Course"}
    </Link>
  ) : course.isFree ? (
    <form action={enrollFree.bind(null, course.id, course.slug)}>
      <button className="fc-btn fc-btn-primary w-full !py-4">{isLive ? "Register for Free" : "Enroll for Free"}</button>
    </form>
  ) : (
    <Link href={`/checkout?course=${course.slug}`} className="fc-btn fc-btn-primary w-full !py-4">{isLive ? "Register Now →" : "Enroll Now"}</Link>
  );

  return (
    <>
      <PageHero label={isLive ? "● Live Masterclass" : "Courses"} title={course.title}
        aside={
          <div className="w-full md:min-w-[230px] md:text-right">
            {isLive && !course.isFree && <p className="text-[15px]">{course.price?.compare_at_minor ? "Introductory offer" : "Price"}</p>}
            {course.price?.compare_at_minor && !course.isFree && (
              <p className="text-lg text-white/50 line-through">{formatMoney(course.price.compare_at_minor, course.price.currency)}</p>
            )}
            <p className={`whitespace-nowrap font-bold tracking-tight ${course.isFree ? "text-5xl md:text-[64px]" : "text-4xl md:text-[52px]"}`}>
              {course.isFree ? "Free" : course.price && formatMoney(course.price.amount_minor, course.price.currency)}
            </p>
            <p className="mt-3 text-[15px]">{isLive ? "Live sessions + recordings" : course.access_days ? `${course.access_days} days access` : "Full lifetime access"}</p>
            <div className="mt-5 md:ml-auto md:w-[210px]">{cta}</div>
          </div>
        }>
        {course.description && <p className="mt-6 max-w-[560px] text-[15px] leading-relaxed">{course.description}</p>}
        <Chips firstLime={Boolean(course.category)} items={[...new Set([
          ...(course.category ? [course.category] : []),
          ...(isLive
            ? ["Live on Zoom", plural(sessions.length, "session"), "Recordings included", course.level ?? "All Levels"]
            : [course.level ?? "All Levels", plural(lessonCount, "lesson"), "Self-paced"]),
          ...(course.certificate_enabled ? ["Certificate of completion"] : []),
          ...course.tags,
        ])]} />
      </PageHero>

      <section className="bg-surface">
        <div className="fc-container pb-24 pt-20">
          <div className="mx-auto max-w-[968px]">
            {isLive && (
              <div className="mb-16">
                <p className="text-sm font-medium uppercase tracking-[0.14em] text-ink">Live sessions on Zoom</p>
                <div className="mt-6 grid gap-3">
                  {sessions.map((l) => {
                    const past = !sessionNotOver(l.starts_at!, l.live_minutes);
                    return (
                      <div key={l.id} className="grid gap-4 rounded-2xl bg-black p-6 text-white md:grid-cols-[auto_1fr_auto] md:items-center">
                        <span aria-hidden className="flex h-14 w-14 items-center justify-center rounded-full border border-white/70">
                          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3.5" y="5" width="17" height="15" rx="2" /><path d="M3.5 9.5h17M8 3v4M16 3v4M8 13h2M12 13h2M16 13h0M8 16.5h2M12 16.5h2" strokeLinecap="round" /></svg>
                        </span>
                        <div>
                          <p className="text-2xl font-medium tracking-tight">{sessionDay(l.starts_at!)}</p>
                          <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-white/85">
                            {SESSION_ZONES.slice(0, 3).map((z) => <span key={z.tz}><span className="text-accent">●</span> {sessionTimes(l.starts_at!, l.live_minutes, z.tz)} {z.label}</span>)}
                          </p>
                          <p className="mt-1 text-sm text-white/70"><LocalTime iso={l.starts_at!} minutes={l.live_minutes} /></p>
                        </div>
                        <span className={`fc-chip ${past ? "text-white/70" : "fc-chip-lime"}`}>{past ? "Recording" : l.title}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {course.highlights.length > 0 && (
              <div className="mb-16 rounded-2xl border border-accent bg-black p-6 text-white md:p-8">
                <p className="text-sm font-medium uppercase tracking-[0.14em] text-accent">What&apos;s included</p>
                <ul className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {course.highlights.map((h) => (
                    <li key={h} className="flex items-start gap-3 text-[15px]">
                      <span aria-hidden className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent">
                        <svg width="10" height="10" viewBox="0 0 10 10"><path d="M2 5.2 4.1 7.2 8 3" fill="none" stroke="#101827" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                      </span>{h}
                    </li>
                  ))}
                </ul>
              </div>
            )}
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
