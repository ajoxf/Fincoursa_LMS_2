import { assetUrl } from "@/lib/assets";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getInstructor } from "@/lib/catalog";
import { CourseCard } from "@/components/site/CourseCard";
import { SectionHeading } from "@/components/site/SectionHeading";

export async function generateMetadata({ params }: PageProps<"/instructors/[slug]">): Promise<Metadata> {
  const d = await getInstructor((await params).slug);
  return d ? { title: d.person.name, description: d.person.title ?? undefined } : {};
}

export default async function InstructorPage({ params }: PageProps<"/instructors/[slug]">) {
  const d = await getInstructor((await params).slug);
  if (!d) notFound();
  const { person, courses, lessons } = d;
  const first = person.name.split(" ")[0];

  return (
    <>
      {/* Full-width portrait fading into black */}
      <section className="relative bg-surface-dark text-white">
        <div className={`relative ${person.photo_url ? "h-[640px] md:h-[880px]" : "h-[420px] md:h-[460px]"}`}>
          {person.photo_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={assetUrl(person.photo_url)} alt="" className="absolute inset-0 h-full w-full object-cover object-[50%_15%]" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 via-30% to-transparent to-60%" />
          <div className="fc-container absolute inset-x-0 bottom-16">
            <div className="flex gap-2">
              <span className="fc-pill fc-pill-dark">The Faculty</span>
              <span className="fc-pill fc-pill-dark">Verified</span>
            </div>
            <h1 className="fc-display mt-4 text-5xl md:text-[56px]">{person.name}</h1>
            {person.title && <p className="mt-3 text-[15px]">{person.title}</p>}
            <dl className="mt-6 flex gap-9">
              <div><dt className="sr-only">Courses</dt><dd className="text-[40px] font-light leading-none">{courses.length}</dd><p className="mt-2 text-[15px]">Courses</p></div>
              <div><dt className="sr-only">Lessons</dt><dd className="text-[40px] font-light leading-none">{lessons}</dd><p className="mt-2 text-[15px]">Lessons</p></div>
            </dl>
          </div>
        </div>
        {person.bio && (
          <div className="fc-container grid gap-8 pb-24 pt-10 md:grid-cols-[230px_1fr] md:gap-9">
            <div className="border-t border-white/80 pt-4">
              <h2 className="fc-display px-4 text-4xl">About {person.name}</h2>
            </div>
            <p className="text-[15px] leading-relaxed text-white/95 md:pt-2">{person.bio}</p>
          </div>
        )}
      </section>

      <section className="bg-white">
        <div className="fc-container py-24">
          <SectionHeading label={`Courses by ${person.name}`} title={`${courses.length} ${courses.length === 1 ? "course" : "courses"}`}
            sub="Work through them in sequence — each course builds on the last. Buy the whole track for one price, or open any course on its own." />
          <div className="mx-auto mt-12 grid max-w-[876px] gap-6">
            {courses.map((c) => <CourseCard key={c.id} course={c} tone="grey" />)}
            {courses.length === 0 && <p className="text-center text-muted">{first}&apos;s courses are coming soon.</p>}
          </div>
        </div>
      </section>
    </>
  );
}
