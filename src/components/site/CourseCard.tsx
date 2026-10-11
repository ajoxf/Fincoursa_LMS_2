import { assetUrl } from "@/lib/assets";
import Link from "next/link";
import type { CourseCard as Course } from "@/lib/catalog";

export function minsLabel(m: number) {
  if (!m) return null;
  if (m < 60) return `${m} mins`;
  const h = Math.round((m / 60) * 10) / 10;
  return `${h} ${h === 1 ? "hour" : "hours"}`;
}

/** Course picture with the admin-selected tags and the instructor name laid over it. */
export function CourseImage({ course, className = "", maxTags = 3 }: { course: Course; className?: string; maxTags?: number }) {
  const ins = course.instructors[0];
  const img = course.thumbnail_url ?? ins?.photo_url ?? null;
  // only the tags the admin picked for the course (no category, length or live date on the picture)
  const tags = (course.tags ?? []).slice(0, maxTags);
  return (
    <div className={`relative overflow-hidden rounded-xl bg-[#1a1410] ${className}`}>
      {img && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={assetUrl(img)} alt="" className="absolute inset-0 h-full w-full object-cover object-[70%_20%]" />
      )}
      <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/45 to-transparent" />
      <div className="relative flex h-full flex-col justify-between p-6 md:p-7">
        <div className="flex flex-wrap gap-3">
          {tags.map((t, i) => <span key={t} className={`fc-chip !py-0.5 text-xs ${i === 0 ? "fc-chip-lime" : "text-white"}`}>{t}</span>)}
        </div>
        {ins && (
          <div className="mt-10 max-w-[80%] text-white">
            <p className="text-2xl font-medium tracking-tight md:text-[28px]">{ins.name}</p>
            {ins.title && <p className="mt-1 text-sm">{ins.title}</p>}
          </div>
        )}
      </div>
    </div>
  );
}

export function CourseCard({ course, tone = "white" }: { course: Course; tone?: "white" | "grey" }) {
  return (
    <Link href={`/courses/${course.slug}`}
      className={`group grid gap-6 rounded-2xl p-4 transition hover:shadow-[0_10px_30px_rgba(16,24,39,.08)] md:grid-cols-[45%_1fr] md:gap-10 ${tone === "white" ? "bg-white" : "bg-surface"}`}>
      <CourseImage course={course} className="min-h-[230px]" />
      <div className="flex flex-col justify-center pb-4 pr-4 md:py-6">
        <h3 className="text-2xl font-normal leading-snug tracking-tight text-ink md:text-[28px]">{course.title}</h3>
        <hr className="my-6 border-ink/80" />
        {course.description && <p className="line-clamp-4 text-[15px] leading-relaxed text-ink/85">{course.description}</p>}
      </div>
    </Link>
  );
}
