import type { CourseCard as Course } from "@/lib/catalog";
import { CourseCard } from "./CourseCard";

const highlights = ["Guided order", "A certificate per course", "Lifetime access"];

export function CourseListPage({ title, courses }: { title: string; courses: Course[] }) {
  return (
    <>
      <section className="bg-primary text-white">
        <div className="fc-container py-16">
          <p className="fc-label">Courses</p>
          <h1 className="mt-2 text-4xl font-bold">{title}</h1>
          <p className="mt-2 text-on-dark/80">{courses.length} courses</p>
          <ul className="mt-6 flex flex-wrap gap-6 text-sm text-on-dark/90">
            {highlights.map((h) => <li key={h} className="flex items-center gap-2"><span className="text-accent">✓</span>{h}</li>)}
          </ul>
        </div>
      </section>
      <section className="fc-container py-16">
        <p className="fc-label">What&apos;s Included</p>
        <h2 className="mt-2 text-2xl font-semibold text-primary">All courses</h2>
        {courses.length === 0 ? (
          <p className="mt-8 text-muted">No courses here yet — check back soon.</p>
        ) : (
          <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {courses.map((c) => <CourseCard key={c.id} course={c} />)}
          </div>
        )}
      </section>
    </>
  );
}
