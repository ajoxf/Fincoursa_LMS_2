import Link from "next/link";
import type { CourseCard as Course } from "@/lib/catalog";
import { formatDuration } from "@/lib/format";
import { formatMoney } from "@/lib/money";

export function CourseCard({ course }: { course: Course }) {
  const ins = course.instructors[0];
  return (
    <Link href={`/courses/${course.slug}`} className="fc-card group flex flex-col overflow-hidden transition hover:-translate-y-0.5 hover:shadow-lg">
      <div className="aspect-video bg-surface">
        {course.thumbnail_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={course.thumbnail_url} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center bg-primary/90 px-6 text-center text-lg font-semibold text-white">{course.title}</div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-3 p-5">
        <div className="flex items-center justify-between text-xs text-muted">
          <span className="font-semibold uppercase tracking-wide text-accent">{course.category ?? "Course"}</span>
          {course.duration_minutes > 0 && <span>{formatDuration(course.duration_minutes)}</span>}
        </div>
        <h3 className="text-lg font-semibold leading-snug text-primary group-hover:underline">{course.title}</h3>
        {ins && (
          <p className="text-sm"><span className="font-medium">{ins.name}</span>{ins.title && <span className="text-muted"> · {ins.title}</span>}</p>
        )}
        {course.description && <p className="line-clamp-3 text-sm text-muted">{course.description}</p>}
        <div className="mt-auto pt-2 text-sm font-semibold">
          {course.isFree ? "Free" : course.price && formatMoney(course.price.amount_minor, course.price.currency)}
        </div>
      </div>
    </Link>
  );
}
