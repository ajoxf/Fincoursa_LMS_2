import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getBundle } from "@/lib/catalog";
import { CourseCard } from "@/components/site/CourseCard";
import { SectionHeading } from "@/components/site/SectionHeading";
import { PageHero, Chips } from "@/components/site/PageHero";
import { formatMoney } from "@/lib/money";
import { enrollFreeBundle } from "@/app/actions/enroll";
import { assetUrl } from "@/lib/assets";

export async function generateMetadata({ params }: PageProps<"/bundles/[slug]">): Promise<Metadata> {
  const b = await getBundle((await params).slug);
  return b ? { title: b.title, description: b.description ?? undefined } : {};
}

export default async function BundlePage({ params }: PageProps<"/bundles/[slug]">) {
  const bundle = await getBundle((await params).slug);
  if (!bundle) notFound();
  const hours = Math.round((bundle.totalMinutes / 60) * 10) / 10;
  return (
    <>
      <PageHero label="Programme" title={bundle.title}
        aside={
          <div className="w-full md:min-w-[230px] md:text-right">
            <p className={`whitespace-nowrap font-bold tracking-tight ${bundle.isFree ? "text-5xl md:text-[64px]" : "text-4xl md:text-[52px]"}`}>
              {bundle.isFree ? "Free" : bundle.price && formatMoney(bundle.price.amount_minor, bundle.price.currency)}
            </p>
            <p className="mt-3 text-[15px]">Full lifetime access</p>
            <div className="mt-5 md:ml-auto md:w-[210px]">
              {bundle.isFree ? (
                <form action={enrollFreeBundle.bind(null, bundle.id)}><button className="fc-btn fc-btn-primary w-full !py-4">Enroll for Free</button></form>
              ) : (
                <Link href={`/checkout?bundle=${bundle.slug}`} className="fc-btn fc-btn-primary w-full !py-4">Enroll Now</Link>
              )}
            </div>
          </div>
        }>
        {bundle.description && <p className="mt-6 max-w-[560px] text-[15px] leading-relaxed">{bundle.description}</p>}
        <Chips items={[`${bundle.courses.length} ${bundle.courses.length === 1 ? "course" : "courses"}`, `${hours} hours`, "Self-paced"]} />
        {bundle.thumbnail_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={assetUrl(bundle.thumbnail_url)} alt="" className="mt-8 aspect-video w-full max-w-[560px] rounded-2xl object-cover" />
        )}
      </PageHero>
      <section className="bg-surface">
        <div className="fc-container py-24">
          <SectionHeading label="What’s included" title="Courses in this track"
            sub="Work through them in sequence — each course builds on the last." />
          <div className="mx-auto mt-12 grid max-w-[968px] gap-6">
            {bundle.courses.map((c) => <CourseCard key={c.id} course={c} />)}
          </div>
        </div>
      </section>
    </>
  );
}
