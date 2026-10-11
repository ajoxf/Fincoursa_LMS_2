import type { CourseCard as Course } from "@/lib/catalog";
import { CourseCard } from "./CourseCard";
import { PageHero, Chips } from "./PageHero";
import { SectionHeading } from "./SectionHeading";

export function CourseListPage({ title, courses, chips }: { title: string; courses: Course[]; chips?: string[] }) {
  return (
    <>
      <PageHero label="Courses" title={title}>
        <Chips firstLime items={[`${courses.length} ${courses.length === 1 ? "course" : "courses"}`,
          ...(chips ?? ["Guided order", ...(courses.some((c) => c.certificate) ? ["Certificates available"] : []), "Lifetime access"])]} />
      </PageHero>
      <section className="bg-surface">
        <div className="fc-container py-24">
          <SectionHeading label="What’s included" title="All courses" sub="Explore all of our available courses." />
          {courses.length === 0 ? (
            <p className="mt-10 text-center text-muted">No courses here yet. Check back soon.</p>
          ) : (
            <div className="mx-auto mt-12 grid max-w-[968px] gap-6">
              {courses.map((c) => <CourseCard key={c.id} course={c} />)}
            </div>
          )}
        </div>
      </section>
    </>
  );
}
