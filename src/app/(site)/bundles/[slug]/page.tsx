import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getBundle, formatDuration } from "@/lib/catalog";
import { CourseCard } from "@/components/site/CourseCard";
import { formatMoney } from "@/lib/money";
import { enrollFreeBundle } from "@/app/actions/enroll";

export async function generateMetadata({ params }: PageProps<"/bundles/[slug]">): Promise<Metadata> {
  const b = await getBundle((await params).slug);
  return b ? { title: b.title, description: b.description ?? undefined } : {};
}

export default async function BundlePage({ params }: PageProps<"/bundles/[slug]">) {
  const bundle = await getBundle((await params).slug);
  if (!bundle) notFound();
  return (
    <>
      <section className="bg-primary text-white">
        <div className="fc-container py-16">
          <p className="fc-label">Learning path</p>
          <h1 className="mt-2 text-4xl font-bold">{bundle.title}</h1>
          <p className="mt-2 text-on-dark/80">{bundle.courses.length} Courses | {formatDuration(bundle.totalMinutes)}</p>
          {bundle.description && <p className="mt-4 max-w-2xl text-lg text-on-dark/85">{bundle.description}</p>}
          <div className="mt-8 flex items-center gap-4">
            <span className="text-2xl font-bold">{bundle.isFree ? "Free" : bundle.price && formatMoney(bundle.price.amount_minor, bundle.price.currency)}</span>
            {bundle.isFree ? (
              <form action={enrollFreeBundle.bind(null, bundle.id)}><button className="fc-btn fc-btn-primary">Enroll for free</button></form>
            ) : (
              <Link href={`/checkout?bundle=${bundle.slug}`} className="fc-btn fc-btn-primary">Enroll now</Link>
            )}
          </div>
        </div>
      </section>
      <section className="fc-container py-16">
        <h2 className="text-2xl font-semibold text-primary">What&apos;s included</h2>
        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {bundle.courses.map((c) => <CourseCard key={c.id} course={c} />)}
        </div>
      </section>
    </>
  );
}
