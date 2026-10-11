import type { Metadata } from "next";
import { getInstructors } from "@/lib/catalog";
import { FacultyCard } from "@/components/site/FacultyCard";
import { SectionHeading } from "@/components/site/SectionHeading";

export const metadata: Metadata = { title: "Instructors" };

export default async function InstructorsPage() {
  const faculty = await getInstructors();
  return (
    <section className="bg-surface-dark">
      <div className="fc-container py-24">
        <SectionHeading dark label="The Faculty" title="Learn from practitioners."
          sub="Industry leaders who have built and run real money — now teaching exactly what worked." />
        <div className="mx-auto mt-16 grid max-w-[1064px] gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {faculty.map((p) => <FacultyCard key={p.id} person={p} />)}
        </div>
      </div>
    </section>
  );
}
