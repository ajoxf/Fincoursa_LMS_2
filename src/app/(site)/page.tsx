import Link from "next/link";
import { getBundles, getCourse, getCourses, getInstructors } from "@/lib/catalog";
import { LiveBanner } from "@/components/site/LiveBanner";
import { sessionNotOver } from "@/lib/format";
import { brand } from "@/components/site/brand";
import { SectionHeading } from "@/components/site/SectionHeading";
import { CatalogFilter } from "@/components/site/CatalogFilter";
import { FacultyCard } from "@/components/site/FacultyCard";
import { OrgTabs } from "@/components/site/OrgTabs";
import { Faq } from "@/components/site/Faq";
import { IntroVideo } from "@/components/site/IntroVideoButton";
import { BundleTile } from "@/components/site/BundleTile";

export default async function HomePage() {
  const [courses, bundles, faculty, all] = await Promise.all([getCourses({ featured: true }), getBundles(), getInstructors(), getCourses()]);
  // Next live masterclass (earliest upcoming session) gets the banner under the hero
  const nextLive = all
    .map((c) => ({ c, t: c.liveSessions.find((t) => sessionNotOver(t, 180)) }))
    .filter((x) => x.t).sort((a, b) => a.t!.localeCompare(b.t!))[0]?.c;
  const live = nextLive ? await getCourse(nextLive.slug) : null;

  return (
    <>
      {/* 1. Hero */}
      <section className="bg-surface-dark text-white">
        <div className="fc-container pb-24 pt-20 md:pt-36">
          <div className="grid items-start gap-10 md:grid-cols-[1.1fr_1fr]">
            <h1 className="fc-display max-w-[500px] text-[2.6rem] md:text-[3.75rem]">Real-World Expertise for the Future of Business</h1>
            <div>
              <p className="max-w-[470px] text-xl font-light leading-snug text-white/75 md:text-[26px]">Learn from industry practitioners. Build skills that work in the real world.</p>
              <div className="mt-12 flex flex-wrap gap-4">
                <Link href="/pages/paid-courses" className="fc-btn fc-btn-primary fc-btn-lg">Browse Course</Link>
                <Link href="/pages/instructors" className="fc-btn fc-btn-outline fc-btn-lg text-white">Meet the faculty</Link>
              </div>
            </div>
          </div>
          <div className="mx-auto max-w-[1080px]"><IntroVideo /></div>
        </div>
      </section>

      {live && <LiveBanner course={live} />}

      {/* 2. Industry experts */}
      <section className="bg-white">
        <div className="fc-container pt-28">
          <p className="text-center text-base font-medium tracking-wide text-ink">INDUSTRY EXPERTS</p>
          <div className="fc-marquee mx-auto mt-10 max-w-[1040px] overflow-hidden">
            <div className="fc-marquee-track items-center gap-20">
              {[0, 1, 2, 3].flatMap((k) => brand.partners.map((p) => p.src ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={`${k}-${p.name}`} src={p.src} alt={k === 0 ? p.name : ""} aria-hidden={k > 0} className="h-6 w-auto shrink-0 md:h-7" />
              ) : (
                <span key={`${k}-${p.name}`} aria-hidden={k > 0} className={`shrink-0 whitespace-nowrap text-xl text-ink md:text-2xl ${p.style}`}>{p.name}</span>
              )))}
            </div>
          </div>
        </div>

        {/* 3. Built for growth */}
        <div className="fc-container grid items-center gap-8 pb-16 pt-24 md:grid-cols-2">
          <div>
            <span className="fc-pill">Built for growth</span>
            <h2 className="fc-h2 mt-4 max-w-md text-ink">Turn knowledge into real returns.</h2>
          </div>
          <p className="max-w-lg text-[15px] leading-relaxed text-ink/85 md:mt-14">
            Every FinCoursa course is built to move a number that matters — your income, your next role, your portfolio. Practical, high-leverage skills from people who&apos;ve actually done it, not theory.
          </p>
        </div>
      </section>

      {/* 4. Learning paths */}
      <section className="bg-surface-dark">
        <div className="fc-container py-24">
          <SectionHeading dark label="Learning paths" title="Structured tracks, not scattered videos." />
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {bundles.slice(0, 3).map((b) => <BundleTile key={b.id} bundle={b} />)}
          </div>
          <div className="mt-10 text-center">
            <Link href="/pages/bundles" className="fc-btn fc-btn-outline-lime fc-btn-lg">View All Bundle</Link>
          </div>
        </div>
      </section>

      {/* 5. Featured catalog */}
      <section className="bg-surface">
        <div className="fc-container py-24">
          <SectionHeading label="Catalog" title="Featured Courses" sub="A hand-picked place to start — pay per course, own it for life." />
          <div className="mt-12"><CatalogFilter courses={courses} /></div>
          <div className="mt-10 text-center">
            <Link href="/pages/paid-courses" className="fc-btn fc-btn-primary fc-btn-lg">View all courses</Link>
          </div>
        </div>
      </section>

      {/* 6. Faculty */}
      <section className="bg-surface-dark">
        <div className="fc-container py-24">
          <SectionHeading dark label="The Faculty" title="Learn from practitioners."
            sub="Industry leaders who have built and run real money — now teaching exactly what worked." />
          <div className="mx-auto mt-16 grid max-w-[1064px] gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {faculty.slice(0, 3).map((p) => <FacultyCard key={p.id} person={p} />)}
          </div>
          <div className="mt-16 text-center">
            <Link href="/pages/instructors" className="fc-btn fc-btn-primary fc-btn-lg">View All Faculties</Link>
          </div>
        </div>
      </section>

      {/* 7. For organizations */}
      <section id="org-section" className="scroll-mt-24 bg-surface-dark">
        <div className="fc-container pb-24 pt-8">
          <SectionHeading dark label="For Organizations" title="Corporate, university & custom training."
            sub="Bring FinCoursa to your team, business school, or training program — with seat licensing, analytics, accredited tracks, and curriculum built around your goals." />
          <div className="mt-12"><OrgTabs /></div>
          <div className="mx-auto mt-12 grid max-w-[1064px] gap-6 rounded-3xl bg-white p-8 md:grid-cols-2 md:p-10">
            <h3 className="fc-h2 max-w-sm text-ink">Bring FinCoursa to your organization.</h3>
            <div>
              <p className="text-[15px] leading-relaxed text-ink/85">Corporate, university or fully custom — tell us your goals and we&apos;ll scope a program that fits. One conversation, one team to work with.</p>
              <Link href="/pages/contact-us" className="fc-btn fc-btn-primary mt-5 fc-btn-lg">Talk to our Team</Link>
            </div>
          </div>
        </div>
      </section>

      {/* 8. FAQ */}
      <section className="bg-surface">
        <div className="fc-container py-24">
          <div className="text-center"><span className="fc-pill">FAQ</span></div>
          <div className="mx-auto mt-14 max-w-[780px]"><Faq /></div>
        </div>
      </section>
    </>
  );
}
