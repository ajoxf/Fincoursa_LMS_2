import Link from "next/link";
import type { CourseDetail } from "@/lib/catalog";
import { formatMoney } from "@/lib/money";
import { SESSION_ZONES, sessionNotOver, sessionTimes } from "@/lib/format";
import { SectionHeading } from "./SectionHeading";

const TZ = SESSION_ZONES[0].tz;
const part = (iso: string, o: Intl.DateTimeFormatOptions) => new Date(iso).toLocaleDateString("en-US", { timeZone: TZ, ...o });

/** "24–25" + "OCT", or "24 OCT – 2 NOV" style date block for the first and last session */
function dateBlock(isos: string[]) {
  const a = isos[0], b = isos[isos.length - 1];
  const sameMonth = part(a, { month: "short" }) === part(b, { month: "short" });
  const days = isos.length > 1 && part(a, { day: "numeric" }) !== part(b, { day: "numeric" })
    ? `${part(a, { day: "numeric" })}${sameMonth ? "–" : ` ${part(a, { month: "short" })} – `}${part(b, { day: "numeric" })}`
    : part(a, { day: "numeric" });
  return { days, month: part(b, { month: "short" }).toUpperCase(), weekdays: isos.map((d) => part(d, { weekday: "short" })).join(" & ") };
}

/** Compact homepage section listing upcoming live workshops; hidden when there are none. */
export function UpcomingLive({ courses, text }: { courses: CourseDetail[]; text?: { label: string; title: string; sub: string } }) {
  const items = courses.map((c) => {
    const sessions = c.chapters.flatMap((ch) => ch.lessons)
      .filter((l) => l.type === "live" && l.starts_at && sessionNotOver(l.starts_at, l.live_minutes))
      .sort((x, y) => x.starts_at!.localeCompare(y.starts_at!));
    return { c, sessions };
  }).filter((x) => x.sessions.length).sort((x, y) => x.sessions[0].starts_at!.localeCompare(y.sessions[0].starts_at!));
  if (!items.length) return null;

  return (
    <section className="bg-white">
      <div className="fc-container py-20">
        <SectionHeading label={text?.label ?? "Live on Zoom"} title={text?.title ?? "Upcoming live workshops"}
          sub={text?.sub ?? "Learn live with the faculty, ask your questions, and keep the recordings in your account."} />
        <div className="mx-auto mt-12 grid max-w-[968px] gap-4">
          {items.map(({ c, sessions }) => {
            const d = dateBlock(sessions.map((s) => s.starts_at!));
            const first = sessions[0];
            const ins = c.instructors[0];
            const price = c.isFree ? "Free" : c.price ? formatMoney(c.price.amount_minor, c.price.currency).replace(/\.00$/, "") : null;
            return (
              <Link key={c.id} href={`/courses/${c.slug}`}
                className="group grid items-center gap-5 rounded-2xl border border-accent/60 bg-black p-5 text-white transition hover:border-accent md:grid-cols-[120px_1fr_auto] md:gap-8 md:p-6">
                <div className="flex items-center gap-4 md:block md:text-center">
                  <p className="whitespace-nowrap text-3xl font-bold leading-none tracking-tight text-accent md:text-[32px]">{d.days}</p>
                  <p className="text-sm font-medium tracking-[0.14em] md:mt-1">{d.month}</p>
                  <p className="text-xs text-white/60 md:mt-1">{d.weekdays}</p>
                </div>
                <div className="min-w-0">
                  <h3 className="text-xl font-medium tracking-tight md:text-2xl">{c.title}</h3>
                  {ins && <p className="mt-1 text-sm text-white/80">with {ins.name}{ins.title ? ` · ${ins.title}` : ""}</p>}
                  <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-white/65">
                    <span className="text-accent">● {sessions.length > 1 ? `${sessions.length} live sessions` : "Live session"}</span>
                    {SESSION_ZONES.slice(0, 3).map((z) => <span key={z.tz}>{sessionTimes(first.starts_at!, first.live_minutes, z.tz)} {z.label}</span>)}
                  </p>
                </div>
                <div className="flex items-center gap-4 md:flex-col md:items-end md:gap-2">
                  {price && <p className="text-2xl font-bold tracking-tight">{price}</p>}
                  <span className="fc-btn fc-btn-primary !min-w-0 !px-5 !py-2.5 group-hover:opacity-90">Register →</span>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
