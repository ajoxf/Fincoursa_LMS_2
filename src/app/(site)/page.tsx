import Link from "next/link";
import { getBundles, getCourses, getInstructors, formatDuration } from "@/lib/catalog";
import { brand } from "@/components/site/brand";
import { SectionHeading } from "@/components/site/SectionHeading";
import { CatalogFilter } from "@/components/site/CatalogFilter";
import { FacultyCard } from "@/components/site/FacultyCard";
import { OrgTabs } from "@/components/site/OrgTabs";
import { Faq } from "@/components/site/Faq";
import { IntroVideoButton } from "@/components/site/IntroVideoButton";

export default async function HomePage() {
  const [courses, bundles, faculty] = await Promise.all([getCourses({ featured: true }), getBundles(), getInstructors()]);
  const track = bundles[0];

  return (
    <>
      {/* 1. Hero */}
      <section className="bg-primary text-white">
        <div className="fc-container py-20 md:py-28">
          <h1 className="max-w-3xl text-4xl font-bold leading-tight tracking-tight md:text-6xl">Real-World Expertise for the Future of Business</h1>
          <p className="mt-5 max-w-xl text-lg text-on-dark/85">Learn from industry practitioners. Build skills that work in the real world.</p>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Link href="/pages/paid-courses" className="fc-btn fc-btn-primary">Browse Course</Link>
            <Link href="/pages/instructors" className="fc-btn fc-btn-outline">Meet the faculty</Link>
            <IntroVideoButton />
          </div>
        </div>
      </section>

      {/* 2. Industry experts strip */}
      <section className="border-b border-line">
        <div className="fc-container flex flex-col items-center gap-6 py-10 md:flex-row md:justify-between">
          <p className="fc-label !text-muted">Industry Experts</p>
          <div className="flex flex-wrap items-center justify-center gap-10">
            {brand.partners.map((p) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={p.name} src={p.src} alt={p.name} className="h-7 w-auto opacity-70 grayscale" />
            ))}
          </div>
        </div>
      </section>

      {/* 3. Built for growth */}
      <section className="fc-container py-20">
        <SectionHeading label="Built for growth" title="Turn knowledge into real returns." sub={
          <>
            <p>Every FinCoursa course is built to move a number that matters — your income, your next role, your portfolio.</p>
            <p className="mt-2">Practical, high-leverage skills from people who&apos;ve actually done it, not theory.</p>
          </>
        } />
      </section>

      {/* 4. Learning paths */}
      <section className="bg-surface">
        <div className="fc-container py-20">
          <SectionHeading label="Learning paths" title="Structured tracks, not scattered videos." />
          {track && (
            <div className="fc-card mt-10 flex flex-col gap-6 p-6 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm text-muted">{track.courses.length} Courses | {formatDuration(track.totalMinutes)}</p>
                <h3 className="mt-1 text-2xl font-semibold text-primary">{track.title}</h3>
              </div>
              <div className="flex items-center gap-4">
                {track.isFree && <span className="rounded-button bg-success/10 px-3 py-1 text-sm font-semibold text-success">Free</span>}
                <Link href={`/bundles/${track.slug}`} className="fc-btn fc-btn-dark">View Bundle</Link>
              </div>
            </div>
          )}
          <Link href="/pages/bundles" className="mt-6 inline-block font-semibold text-primary underline-offset-4 hover:underline">View All Bundle →</Link>
        </div>
      </section>

      {/* 5. Featured catalog */}
      <section className="fc-container py-20">
        <SectionHeading label="Catalog" title="Featured Courses" sub="A hand-picked place to start — pay per course, own it for life." />
        <div className="mt-8"><CatalogFilter courses={courses} /></div>
        <Link href="/pages/paid-courses" className="mt-8 inline-block font-semibold text-primary underline-offset-4 hover:underline">View all courses →</Link>
      </section>

      {/* 6. Faculty */}
      <section className="bg-surface-dark">
        <div className="fc-container py-20">
          <SectionHeading dark label="The Faculty" title="Learn from practitioners."
            sub="Industry leaders who have built and run real money — now teaching exactly what worked." />
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {faculty.slice(0, 3).map((p) => <FacultyCard key={p.id} person={p} />)}
          </div>
          <Link href="/pages/instructors" className="fc-btn fc-btn-primary mt-10">View All Faculties</Link>
        </div>
      </section>

      {/* 7. For organizations */}
      <section id="org-section" className="scroll-mt-20 bg-primary">
        <div className="fc-container grid gap-12 py-20 lg:grid-cols-2">
          <div>
            <SectionHeading dark title="Bring FinCoursa to your organization."
              sub="Corporate, university or fully custom — tell us your goals and we'll scope a program that fits. One conversation, one team to work with." />
            <Link href="/pages/contact-us" className="fc-btn fc-btn-primary mt-8">Talk to our Team</Link>
          </div>
          <OrgTabs />
        </div>
      </section>

      {/* 8. FAQ */}
      <section className="fc-container py-20">
        <SectionHeading label="FAQ" title="Frequently asked questions" />
        <div className="mt-8 max-w-3xl"><Faq /></div>
      </section>
    </>
  );
}
