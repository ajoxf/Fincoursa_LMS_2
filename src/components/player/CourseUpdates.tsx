import Link from "next/link";
import { formatDate } from "@/lib/format";
import { linkParts, type Announcement } from "@/lib/announcements";

function Body({ text, name }: { text: string; name?: string | null }) {
  const first = name?.trim().split(/\s+/)[0] || "there";
  return (
    <>
      {text.replace(/\{first_name\}/g, first).split(/\n{2,}/).map((para, i) => (
        <p key={i} className="mt-2 whitespace-pre-line">
          {linkParts(para).map((x, j) => x.href ? <a key={j} href={x.href} target="_blank" rel="noopener noreferrer" className="underline">{x.t}</a> : <span key={j}>{x.t}</span>)}
        </p>
      ))}
    </>
  );
}

/** Newest course update as a banner; older ones fold out. Used in the lesson player. */
export function CourseUpdatesBanner({ items, name }: { items: Announcement[]; name?: string | null }) {
  if (!items.length) return null;
  const [first, ...rest] = items;
  return (
    <details className="group border-b border-line bg-accent/15 px-4 py-3 text-sm text-ink">
      <summary className="flex cursor-pointer list-none items-start justify-between gap-3">
        <span className="min-w-0"><b>Course update:</b> {first.title} <span className="text-ink/60">· {formatDate(first.created_at)}</span></span>
        <span className="shrink-0 text-xs underline group-open:hidden">Read</span><span className="hidden shrink-0 text-xs underline group-open:inline">Close</span>
      </summary>
      <div className="mt-1 max-w-[680px] text-ink/85"><Body text={first.body} name={name} /></div>
      {rest.map((a) => (
        <div key={a.id} className="mt-4 max-w-[680px] border-t border-ink/10 pt-3 text-ink/85">
          <p className="font-medium text-ink">{a.title} <span className="font-normal text-ink/60">· {formatDate(a.created_at)}</span></p>
          <Body text={a.body} name={name} />
        </div>
      ))}
    </details>
  );
}

/** "Updates from your courses" on the student dashboard. */
export function CourseUpdatesList({ items, name }: { items: Announcement[]; name?: string | null }) {
  if (!items.length) return null;
  return (
    <section>
      <h2 className="text-xl font-semibold text-primary">Updates from your courses</h2>
      <ul className="mt-4 grid gap-3">
        {items.map((a) => (
          <li key={a.id} className="fc-card p-5">
            <p className="text-xs text-muted">{a.course?.title} · {formatDate(a.created_at, "long")}</p>
            <p className="mt-1 font-semibold text-ink">{a.title}</p>
            <div className="line-clamp-4 text-sm text-ink/85"><Body text={a.body} name={name} /></div>
            {a.course && <Link href={`/learn/${a.course.slug}`} className="mt-3 inline-block text-sm font-medium underline">Open the course</Link>}
          </li>
        ))}
      </ul>
    </section>
  );
}
