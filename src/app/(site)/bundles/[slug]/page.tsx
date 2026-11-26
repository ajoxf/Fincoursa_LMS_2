import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { accessLabel, getBundle } from "@/lib/catalog";
import { CourseCard } from "@/components/site/CourseCard";
import { SectionHeading } from "@/components/site/SectionHeading";
import { PageHero, Chips } from "@/components/site/PageHero";
import { formatMoney } from "@/lib/money";
import { enrollFreeBundle } from "@/app/actions/enroll";
import { assetUrl } from "@/lib/assets";
import { EnrolmentSoon } from "@/components/site/EnrolmentSoon";
import { NotifyMe } from "@/components/site/NotifyMe";
import { paymentsOpen } from "@/lib/payments/registry";
import { cmtCurriculumFor } from "@/lib/cmt-curriculum";

export async function generateMetadata({ params }: PageProps<"/bundles/[slug]">): Promise<Metadata> {
  const b = await getBundle((await params).slug);
  if (!b) return {};
  const description = b.description ?? undefined;
  return {
    title: b.title, description, alternates: { canonical: `/bundles/${b.slug}` },
    openGraph: { title: b.title, description, url: `/bundles/${b.slug}`, ...(b.thumbnail_url ? { images: [{ url: b.thumbnail_url, alt: b.title }] } : {}) },
    twitter: { card: "summary_large_image", title: b.title, description, ...(b.thumbnail_url ? { images: [b.thumbnail_url] } : {}) },
  };
}

export default async function BundlePage({ params }: PageProps<"/bundles/[slug]">) {
  const bundle = await getBundle((await params).slug);
  if (!bundle) notFound();
  // CMT Level I / II programmes: the curriculum outline (sections and their sub-sections)
  const curriculum = cmtCurriculumFor(bundle.slug);
  const notOpen = !bundle.comingSoon && !bundle.isFree && Boolean(bundle.price) && !(await paymentsOpen(bundle.price!.currency));
  const hours = Math.round((bundle.totalMinutes / 60) * 10) / 10;
  return (
    <>
      <PageHero label="Programme" title={bundle.title}
        aside={
          <div className="w-full md:min-w-[230px] md:text-right">
            <p className={`whitespace-nowrap font-bold tracking-tight ${bundle.isFree || bundle.comingSoon ? "text-5xl md:text-[64px]" : "text-4xl md:text-[52px]"}`}>
              {bundle.comingSoon ? "Coming soon" : bundle.isFree ? "Free" : bundle.price && formatMoney(bundle.price.amount_minor, bundle.price.currency)}
            </p>
            <p className="mt-3 text-[15px]">{bundle.comingSoon ? bundle.launchNote : accessLabel(bundle.courses.map((c) => c.accessDays))}</p>
            <div className="mt-5 md:ml-auto md:w-[260px]">
              {bundle.comingSoon ? (
                <NotifyMe bundleId={bundle.id} />
              ) : bundle.isFree ? (
                <form action={enrollFreeBundle.bind(null, bundle.id)}><button className="fc-btn fc-btn-primary w-full !py-4">Enroll for Free</button></form>
              ) : notOpen ? (
                <EnrolmentSoon />
              ) : (
                <Link href={`/checkout?bundle=${bundle.slug}`} className="fc-btn fc-btn-primary w-full !py-4">Enroll Now</Link>
              )}
            </div>
          </div>
        }>
        {bundle.description && <p className="mt-6 max-w-[560px] text-[15px] leading-relaxed">{bundle.description}</p>}
        <Chips items={[...(bundle.comingSoon ? [] : [`${bundle.courses.length} ${bundle.courses.length === 1 ? "course" : "courses"}`]), ...(hours > 0 ? [`${hours} hours`] : []), "Self-paced"]} />
        {bundle.thumbnail_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={assetUrl(bundle.thumbnail_url)} alt="" className="mt-8 aspect-video w-full max-w-[560px] rounded-2xl object-cover" />
        )}
      </PageHero>
      {bundle.comingSoon ? (
        // before launch: a short summary, plus anything in the programme that is already open
        <section className="bg-surface">
          <div className="fc-container py-24">
            <SectionHeading label="What’s included" title="What this programme will include"
              sub="Courses are being prepared and will open over time. Leave your email above and we’ll tell you as soon as they do." />
            <ul className="mx-auto mt-10 grid max-w-[968px] gap-4 sm:grid-cols-3">
              {["Study courses that follow the curriculum, section by section", "A question bank with exam-style and chart questions, each answer explained", "Timed exam mode to build pace before exam day"].map((t) => (
                <li key={t} className="rounded-2xl bg-white p-6 text-[15px] leading-relaxed text-ink/85">{t}</li>
              ))}
            </ul>
            {curriculum && (
              <div className="mx-auto mt-14 max-w-[968px]">
                <h3 className="text-center text-2xl font-semibold text-ink">The {curriculum.level} curriculum</h3>
                <p className="mt-2 text-center text-[15px] text-muted">A study course for each section, covering every sub-section below.</p>
                <div className="mt-8 grid gap-4 md:grid-cols-2">
                  {curriculum.sections.map(([sec, chapters]) => (
                    <div key={sec} className="rounded-2xl bg-white p-5">
                      <div className="flex items-start justify-between gap-3">
                        <p className="font-semibold text-ink">{sec}</p>
                        <span className="shrink-0 rounded-full bg-surface px-2 py-0.5 text-[11px] font-semibold text-muted">Coming soon</span>
                      </div>
                      <ul className="mt-2 grid gap-1 pl-5 text-sm text-ink/75">
                        {chapters.map((c) => <li key={c} className="list-disc">{c}</li>)}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {bundle.courses.some((c) => !c.comingSoon) && (
              <div className="mx-auto mt-14 grid max-w-[968px] gap-6">
                <h3 className="text-center text-2xl font-semibold text-ink">Available now</h3>
                {bundle.courses.filter((c) => !c.comingSoon).map((c) => <CourseCard key={c.id} course={c} />)}
              </div>
            )}
          </div>
        </section>
      ) : (
      <section className="bg-surface">
        <div className="fc-container py-24">
          <SectionHeading label="What’s included" title="Courses in this track"
            sub="Work through them in sequence — each course builds on the last." />
          <div className="mx-auto mt-12 grid max-w-[968px] gap-6">
            {bundle.courses.map((c) => <CourseCard key={c.id} course={c} />)}
          </div>
        </div>
      </section>
      )}
    </>
  );
}
