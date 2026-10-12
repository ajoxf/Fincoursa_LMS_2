import type { Metadata } from "next";
import { getBundles } from "@/lib/catalog";
import { PageHero, Chips } from "@/components/site/PageHero";
import { BundleTile } from "@/components/site/BundleTile";

export const metadata: Metadata = { title: "Programmes", alternates: { canonical: "/pages/programmes" } };

export default async function BundlesPage() {
  const bundles = await getBundles();
  return (
    <>
      <PageHero label="Programmes" title="Structured tracks, not scattered videos.">
        <Chips firstLime items={[`${bundles.length} ${bundles.length === 1 ? "programme" : "programmes"}`, "Guided order", "One price per programme"]} />
      </PageHero>
      <section className="bg-surface-dark">
        <div className="fc-container grid gap-5 pb-24 sm:grid-cols-2 lg:grid-cols-3">
          {bundles.map((b) => <BundleTile key={b.id} bundle={b} />)}
        </div>
      </section>
    </>
  );
}
