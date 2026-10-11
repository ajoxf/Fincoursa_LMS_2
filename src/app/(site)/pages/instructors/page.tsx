import type { Metadata } from "next";
import { getInstructors } from "@/lib/catalog";
import { FacultyCard } from "@/components/site/FacultyCard";
import { PageHero } from "@/components/site/PageHero";

export const metadata: Metadata = { title: "Instructors" };

export default async function InstructorsPage() {
  const faculty = await getInstructors();
  return (
    <>
      <PageHero label="The Faculty" title="Learn from practitioners.">
        <p className="mt-5 max-w-[540px] text-[15px] leading-relaxed">Industry leaders who have built and run real money — now teaching exactly what worked.</p>
      </PageHero>
      <section className="bg-surface">
        <div className="fc-container py-24">
          <h2 className="fc-h2 text-center text-ink">Our Faculty</h2>
          <div className="mx-auto mt-10 grid max-w-[1064px] gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {faculty.map((p) => <FacultyCard key={p.id} person={p} />)}
          </div>
        </div>
      </section>
    </>
  );
}
