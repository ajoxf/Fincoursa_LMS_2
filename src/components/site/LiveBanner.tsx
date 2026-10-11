import { assetUrl } from "@/lib/assets";
import Link from "next/link";
import type { CourseDetail } from "@/lib/catalog";
import { formatMoney } from "@/lib/money";
import { SESSION_ZONES, sessionNotOver, sessionTimes } from "@/lib/format";

/** "Sat, Oct 24 & Sun, Oct 25, 2026" (in the business timezone) */
function dayList(isos: string[]) {
  const f = (iso: string, year: boolean) => new Date(iso).toLocaleDateString("en-US", {
    timeZone: SESSION_ZONES[0].tz, weekday: "short", month: "short", day: "numeric", ...(year ? { year: "numeric" } : {}),
  });
  return isos.map((d, i) => f(d, i === isos.length - 1)).join(" & ");
}

/**
 * Homepage banner for the next live masterclass, laid out like the FinCoursa masterclass flyers.
 * Built from the course itself (title, subtitle, What's included, sessions, price, instructor),
 * so publishing a live course is enough. It disappears once the sessions are over.
 */
export function LiveBanner({ course }: { course: CourseDetail }) {
  const sessions = course.chapters.flatMap((c) => c.lessons)
    .filter((l) => l.type === "live" && l.starts_at && sessionNotOver(l.starts_at, l.live_minutes))
    .sort((a, b) => a.starts_at!.localeCompare(b.starts_at!));
  if (!sessions.length) return null;
  const first = sessions[0];
  const ins = course.instructors[0];
  const price = course.isFree ? "Free" : course.price ? formatMoney(course.price.amount_minor, course.price.currency).replace(/\.00$/, "") : null;

  return (
    <section className="bg-surface-dark pb-20">
      <div className="fc-container">
        <Link href={`/courses/${course.slug}`} className="group relative block overflow-hidden rounded-3xl border border-accent/70 bg-black text-white">
          {ins?.photo_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={assetUrl(ins.photo_url)} alt="" className="absolute inset-y-0 right-0 hidden h-full w-[48%] object-cover object-top md:block" />
          )}
          <div className="absolute inset-0 hidden bg-gradient-to-r from-black via-black/90 via-50% to-black/10 md:block" />
          <div className="relative grid gap-8 p-6 md:p-10">
            <div className="flex flex-wrap items-end justify-between gap-8">
              <div className="max-w-[640px]">
                <span className="fc-pill fc-pill-dark !text-[13px]"><span className="mr-2 text-accent">●</span>Live masterclass &nbsp;|&nbsp; FinCoursa</span>
                <h2 className="mt-6 text-4xl font-bold leading-[1.02] tracking-tight md:text-[56px]">{course.title}</h2>
                {course.subtitle && <p className="mt-4 text-2xl font-bold text-accent md:text-[34px]">{course.subtitle}</p>}
                <span aria-hidden className="mt-4 block h-1 w-20 bg-accent" />
              </div>
              {ins && (
                <div className="md:text-right">
                  <span aria-hidden className="mb-2 inline-block h-1 w-12 bg-accent" />
                  <p className="text-xl font-bold">{ins.name}</p>
                  {ins.title && <p className="text-sm text-white/85">{ins.title}</p>}
                </div>
              )}
            </div>

            {course.highlights.length > 0 && (
              <div className="rounded-2xl border border-accent/70 bg-black/60 p-5 backdrop-blur-sm">
                <p className="text-sm font-bold uppercase tracking-[0.12em] text-accent">What&apos;s included</p>
                <ul className="mt-4 grid grid-cols-2 gap-4 text-sm md:grid-cols-3 lg:grid-cols-6">
                  {course.highlights.slice(0, 6).map((h) => (
                    <li key={h} className="flex items-start gap-2">
                      <span aria-hidden className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-accent">
                        <svg width="8" height="8" viewBox="0 0 10 10"><path d="M2 5.2 4.1 7.2 8 3" fill="none" stroke="#101827" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                      </span>{h}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="grid items-center gap-5 rounded-2xl border border-accent/70 bg-black/60 p-5 backdrop-blur-sm lg:grid-cols-[1fr_auto_auto]">
              <div>
                <p className="text-xl font-bold md:text-2xl">{dayList(sessions.map((s) => s.starts_at!))}</p>
                <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm text-white/85">
                  {SESSION_ZONES.slice(0, 3).map((z, i) => (
                    <span key={z.tz}>{i > 0 && <span className="mr-3 hidden text-white/40 md:inline">|</span>}{sessionTimes(first.starts_at!, first.live_minutes, z.tz)} {z.label}</span>
                  ))}
                </p>
              </div>
              <span className="fc-btn fc-btn-primary !px-8 !py-4 text-lg font-bold group-hover:opacity-90">Register Now →</span>
              {price && (
                <div className="lg:border-l lg:border-white/20 lg:pl-6 lg:text-center">
                  {course.price?.compare_at_minor ? <p className="text-sm text-white/80">Introductory offer</p> : null}
                  <p className="text-4xl font-bold tracking-tight">{price}</p>
                </div>
              )}
            </div>
          </div>
        </Link>
      </div>
    </section>
  );
}
