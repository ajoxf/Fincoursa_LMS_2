import Link from "next/link";
import type { BundleCard } from "@/lib/catalog";
import { formatMoney } from "@/lib/money";
import { assetUrl } from "@/lib/assets";

function hours(mins: number) {
  const h = Math.round((mins / 60) * 10) / 10;
  return `${h} Hours`;
}

/** Learning-path tile on a black section; shows the bundle image (Admin → Bundles) when one is uploaded. */
export function BundleTile({ bundle }: { bundle: BundleCard }) {
  return (
    <div className="group flex flex-col rounded-2xl bg-surface-raised p-4 text-white">
      {bundle.thumbnail_url && (
        <Link href={`/bundles/${bundle.slug}`} className="-mx-1 -mt-1 mb-4 block aspect-video overflow-hidden rounded-xl bg-black" tabIndex={-1} aria-hidden>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={assetUrl(bundle.thumbnail_url)} alt="" className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]" />
        </Link>
      )}
      <p className="text-sm">{bundle.courses.length} {bundle.courses.length === 1 ? "Course" : "Courses"} <span className="mx-3">|</span> {hours(bundle.totalMinutes)}</p>
      <h3 className="mt-2 text-2xl font-normal tracking-tight">{bundle.title}</h3>
      <p className="mt-1 text-sm">{bundle.isFree ? "Free" : bundle.price && formatMoney(bundle.price.amount_minor, bundle.price.currency)}</p>
      <Link href={`/bundles/${bundle.slug}`} className="mt-8 self-start border-b-2 border-accent pb-1 font-medium text-accent hover:opacity-80">View Bundle</Link>
    </div>
  );
}
