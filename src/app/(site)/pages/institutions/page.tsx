import type { Metadata } from "next";
import { PageHero } from "@/components/site/PageHero";
import { getCourses } from "@/lib/catalog";
import { ALL_COUNTRIES, countryName } from "@/lib/format";
import { getGrowthSettings, ORG_TYPES } from "@/lib/growth";
import { EnquiryForm } from "./EnquiryForm";

export const metadata: Metadata = {
  title: "For Institutions",
  description: "Practical finance and AI training for banks, brokers, asset managers and universities. Team licences, cohorts with senior practitioners, and a free pilot.",
};

// first markets first, then everyone else A–Z
const TOP = ["US", "AE", "SG", "IN", "GB", "DE", "FR", "NL", "CH", "HK", "SA", "QA"];
const COUNTRIES: [string, string][] = [...TOP.map((c) => [c, countryName(c)] as [string, string]), ...ALL_COUNTRIES.filter(([c]) => !TOP.includes(c))];

const WAYS = [
  ["Team licences", "Give a team access to chosen courses, with certificates for everyone who completes them. Priced per person, with volume discounts."],
  ["Cohort programmes", "A course plus live sessions with a senior practitioner, scheduled for your team and built around its work."],
  ["University partnerships", "Co-branded certificate programmes, elective modules and student pricing for finance departments and business schools."],
  ["Custom programmes", "Training built around your own workflows, data rules and tools, delivered by practitioners who have done the work."],
];

export default async function InstitutionsPage({ searchParams }: PageProps<"/pages/institutions">) {
  const sp = await searchParams;
  const [courses, s] = await Promise.all([getCourses().catch(() => []), getGrowthSettings()]);
  const preselect = typeof sp.course === "string" ? courses.find((c) => c.slug === sp.course)?.id : undefined;

  return (
    <>
      <PageHero label="For Institutions" title={<>Finance and AI skills that <span className="text-accent">pay for themselves.</span></>}>
        <p className="mt-6 max-w-[580px] text-[17px] leading-relaxed text-white/85">
          Practical training for banks, brokers, asset managers and universities, taught by senior practitioners. Built around two
          outcomes your organisation can measure: better decisions, and time and cost saved with AI.
        </p>
        <a href="#enquire" className="fc-btn fc-btn-primary fc-btn-lg mt-8 inline-flex">Request a proposal</a>
      </PageHero>

      <section className="bg-surface">
        <div className="fc-container grid gap-16 py-20">
          <div className="grid gap-6 md:grid-cols-2">
            <div className="rounded-2xl bg-white p-8">
              <p className="text-sm font-medium uppercase tracking-[0.14em] text-ink/70">Make more</p>
              <h2 className="mt-3 text-2xl font-semibold text-ink">Sharper research and decisions</h2>
              <p className="mt-3 text-[15px] leading-relaxed text-ink/85">Market analysis, strategy testing and risk skills, taught with tested methods and practical exercises on fictional data.</p>
            </div>
            <div className="rounded-2xl bg-white p-8">
              <p className="text-sm font-medium uppercase tracking-[0.14em] text-ink/70">Save more</p>
              <h2 className="mt-3 text-2xl font-semibold text-ink">Time and cost saved with AI</h2>
              <p className="mt-3 text-[15px] leading-relaxed text-ink/85">Safe, efficient use of AI for research, reporting and operations, with each person measuring the hours they save.</p>
            </div>
          </div>

          <div className="grid gap-6">
            <h2 className="fc-h2 text-ink">Ways to work with us</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {WAYS.map(([t, d]) => (
                <div key={t} className="rounded-2xl bg-white p-6">
                  <h3 className="text-lg font-semibold text-ink">{t}</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-ink/85">{d}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-6">
            <h2 className="fc-h2 text-ink">How it works</h2>
            <ol className="grid gap-4 md:grid-cols-4">
              {[
                ["Tell us what you need", "Your team, your goals and the courses you're interested in."],
                ["Get a proposal", "Within one working day: courses, format and pricing for your team."],
                ["Start with a free pilot", `${s.pilot_seats} people, full access for ${s.pilot_days} days, at no cost.`],
                ["Roll out", "Licences or a cohort for the whole team, with invoices for your finance team."],
              ].map(([t, d], i) => (
                <li key={t} className="rounded-2xl bg-white p-6">
                  <span className="text-sm font-semibold text-ink/60">Step {i + 1}</span>
                  <p className="mt-2 font-semibold text-ink">{t}</p>
                  <p className="mt-1 text-[15px] text-ink/85">{d}</p>
                </li>
              ))}
            </ol>
          </div>

          {courses.length > 0 && (
            <div className="grid gap-6">
              <h2 className="fc-h2 text-ink">Courses</h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {courses.map((c) => (
                  <a key={c.id} href={`/courses/${c.slug}`} className="grid content-start gap-2 rounded-2xl bg-white p-6 hover:outline hover:outline-2 hover:outline-ink">
                    {c.comingSoon && <span className="fc-chip self-start !py-0.5 text-xs">Coming soon</span>}
                    <p className="text-lg font-semibold text-ink">{c.title}</p>
                    {c.subtitle && <p className="text-[15px] text-ink/80">{c.subtitle}</p>}
                  </a>
                ))}
              </div>
            </div>
          )}

          <div id="enquire" className="scroll-mt-24 grid gap-6 rounded-3xl bg-white p-8 md:p-12">
            <div>
              <span className="fc-pill">Request a proposal</span>
              <h2 className="fc-h2 mt-4 text-ink">Tell us about your team</h2>
              <p className="mt-3 max-w-[640px] text-[15px] text-ink/85">We reply within one working day with a proposal, pricing and a free pilot for your team.</p>
            </div>
            <EnquiryForm courses={courses.map((c) => ({ id: c.id, title: c.title }))} preselect={preselect} orgTypes={ORG_TYPES} countries={COUNTRIES} />
          </div>
        </div>
      </section>
    </>
  );
}
