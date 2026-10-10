import type { Metadata } from "next";
import Link from "next/link";
import { getBundles, formatDuration } from "@/lib/catalog";
import { formatMoney } from "@/lib/money";

export const metadata: Metadata = { title: "Bundles" };

export default async function BundlesPage() {
  const bundles = await getBundles();
  return (
    <>
      <section className="bg-primary text-white">
        <div className="fc-container py-16">
          <p className="fc-label">Learning paths</p>
          <h1 className="mt-2 text-4xl font-bold">Structured tracks, not scattered videos.</h1>
        </div>
      </section>
      <section className="fc-container grid gap-6 py-16">
        {bundles.map((b) => (
          <div key={b.id} className="fc-card flex flex-col gap-6 p-6 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm text-muted">{b.courses.length} Courses | {formatDuration(b.totalMinutes)}</p>
              <h2 className="mt-1 text-2xl font-semibold text-primary">{b.title}</h2>
              {b.description && <p className="mt-2 max-w-2xl text-muted">{b.description}</p>}
            </div>
            <div className="flex items-center gap-4">
              <span className="font-semibold">{b.isFree ? "Free" : b.price && formatMoney(b.price.amount_minor, b.price.currency)}</span>
              <Link href={`/bundles/${b.slug}`} className="fc-btn fc-btn-dark">View Bundle</Link>
            </div>
          </div>
        ))}
      </section>
    </>
  );
}
