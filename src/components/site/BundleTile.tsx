import Link from "next/link";
import type { BundleCard } from "@/lib/catalog";
import { formatMoney } from "@/lib/money";

function hours(mins: number) {
  const h = Math.round((mins / 60) * 10) / 10;
  return `${h} Hours`;
}

/** Learning-path tile on a black section. */
export function BundleTile({ bundle }: { bundle: BundleCard }) {
  return (
    <div className="flex flex-col rounded-2xl bg-surface-raised p-4 text-white">
      <p className="text-sm">{bundle.courses.length} Courses <span className="mx-3">|</span> {hours(bundle.totalMinutes)}</p>
      <h3 className="mt-2 text-2xl font-normal tracking-tight">{bundle.title}</h3>
      <p className="mt-1 text-sm">{bundle.isFree ? "Free" : bundle.price && formatMoney(bundle.price.amount_minor, bundle.price.currency)}</p>
      <Link href={`/bundles/${bundle.slug}`} className="mt-8 self-start border-b-2 border-accent pb-1 font-medium text-accent hover:opacity-80">View Bundle</Link>
    </div>
  );
}
