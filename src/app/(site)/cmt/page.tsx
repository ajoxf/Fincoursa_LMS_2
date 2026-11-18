import type { Metadata } from "next";
import Link from "next/link";
import { PageHero, Chips } from "@/components/site/PageHero";
import { SectionHeading } from "@/components/site/SectionHeading";
import { getBundles, type CourseCard } from "@/lib/catalog";
import { CMT_PPP, cmtDisclaimer } from "@/lib/cmt-ppp";

export const metadata: Metadata = {
  title: "CMT Exam Prep",
  description: "Prepare for the Chartered Market Technician (CMT) exams with FinCoursa: exam-style question banks with chart questions and worked explanations, and complimentary sample questions.",
  alternates: { canonical: "/cmt" },
  openGraph: { title: "CMT Exam Prep | FinCoursa", url: "/cmt", description: "Exam-style CMT practice with chart questions and worked explanations. Start with complimentary sample questions." },
};

const SAMPLE = "/go/cmt-free-sample?v=cmt-page";
// One programme per level (Admin → Programmes): a course for each curriculum section, then the level's question bank
const LEVELS_PROGRAMMES = [
  { level: "Level I", n: 1, slug: "cmt-level-1", about: "The foundations: the vocabulary and building blocks of technical analysis." },
  { level: "Level II", n: 2, slug: "cmt-level-2", about: "Applying the tools: reading charts, combining indicators and testing an approach." },
  { level: "Level III", n: 3, slug: "cmt-level-3", about: "Judgement: building a view across markets, managing risk and portfolio decisions." },
];
const isLive = (c?: CourseCard) => Boolean(c && !c.comingSoon);

// Exam facts as published by the CMT Association (cmtassociation.org); checked November 2026.
const LEVELS = [
  { level: "Level I", format: "132 multiple-choice questions", time: "2 hours", focus: "The vocabulary and building blocks of technical analysis: chart types, trends, patterns, indicators and the theory behind them." },
  { level: "Level II", format: "170 multiple-choice questions", time: "4 hours", focus: "Applying the tools: reading charts, combining indicators, relative strength, market internals, cycles and testing a trading approach." },
  { level: "Level III", format: "Short essays and multiple-choice questions", time: "4 hours", focus: "Judgement: building a view across markets, risk management and portfolio decisions, explained in writing." },
];

const FAQ: [string, React.ReactNode][] = [
  ["What is the CMT?", <>The Chartered Market Technician (CMT) is a professional designation in technical analysis, awarded by the CMT Association. Candidates pass three exams (Level I, II and III), taken in order, and meet the Association&apos;s membership and work-experience requirements.</>],
  ["When are the exams?", <>The CMT Association offers the exams twice a year, in June and December. For June 2027 it lists Level I and II from 1 to 17 June and Level III on 3 June. Always check dates and registration deadlines at <a href="https://cmtassociation.org/cmt-program/register/" target="_blank" rel="noopener" className="underline">cmtassociation.org</a>.</>],
  ["How much does registration cost?", <>The CMT Association sets the fees, which depend on when you register. For June 2027 it lists US$875 (early, until 24 February 2027), US$1,075 (standard, until 31 March) and US$1,475 (late, until 20 April) per level. These are paid to the CMT Association, not to FinCoursa.</>],
  ["Do I still need the official curriculum?", <>Yes. FinCoursa materials help you practise and check your understanding; they do not replace the CMT Association&apos;s curriculum and readings.</>],
  ["Which levels do you cover?", <>There is a CMT programme for each level, with study courses and a question bank. The Level II Question Bank is available now; the rest are coming soon, and you can ask to be told when each one opens from its course page.</>],
  ["Is there a free trial?", <>Yes. Complimentary sample questions from every section of the Level II Question Bank, charts included. You only need a free FinCoursa account; no payment details are asked for.</>],
];

export default async function CmtPrepPage() {
  const bundles = await getBundles().catch(() => []);
  const track = LEVELS_PROGRAMMES.map((l) => ({ ...l, programme: bundles.find((b) => b.slug === l.slug) }));

  return (
    <>
      <PageHero label="CMT Exam Prep" title={<>Prepare for the <span className="text-accent">Chartered Market Technician</span> exams.</>}
        aside={
          <div className="w-full rounded-2xl border border-accent/50 bg-white/[0.04] p-6 md:w-[340px]">
            {CMT_PPP.APPROVED ? (
              <>
                {CMT_PPP.BADGE && <img src={CMT_PPP.BADGE} alt="CMT Association Participating Prep Provider" className="mb-3 h-16 w-auto" />}
                <p className="text-[15px] leading-relaxed text-white/85">{CMT_PPP.STATUS}</p>
              </>
            ) : (
              <>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">Free to start</p>
                <p className="mt-3 text-[15px] leading-relaxed text-white/85">Try exam-style CMT Level II questions, charts included, before you decide.</p>
              </>
            )}
            <Link href={SAMPLE} className="fc-btn fc-btn-primary mt-5 w-full !py-3.5">Start Practising</Link>
            <p className="mt-2 text-center text-xs text-white/60">Complimentary sample questions. No payment needed.</p>
          </div>
        }>
        <p className="mt-6 max-w-[580px] text-[17px] leading-relaxed text-white/85">
          Exam-style practice for CMT candidates: questions mapped to the curriculum, chart questions where you read the chart to find
          the answer, and a worked explanation for every option.
        </p>
        <Chips items={["Technical Analysis", "Question Banks", "Chart Questions", "Timed Exam Mode"]} firstLime />
      </PageHero>

      {/* the programmes, one per level */}
      <section className="bg-surface">
        <div className="fc-container grid gap-10 py-20">
          <SectionHeading label="CMT Programmes" title="A programme for each level"
            sub="Study courses and a question bank for each level, released over time. Start today with the Level II Question Bank and its complimentary sample questions." />
          <div className="grid gap-4 md:grid-cols-3">
            {track.map((l) => {
              // what's open now in this level (e.g. the Level II Question Bank), else the level is coming soon
              const live = (l.programme?.courses ?? []).filter(isLive);
              return (
                <div key={l.level} className={`flex flex-col rounded-2xl bg-white p-6 ${live.length ? "ring-2 ring-accent" : ""}`}>
                  <p className="text-sm font-semibold uppercase tracking-[0.14em] text-primary">{l.level}</p>
                  <h3 className="mt-1 text-xl font-semibold text-ink">CMT {l.level} Programme</h3>
                  <p className="mt-3 text-[15px] leading-relaxed text-ink/85">{l.about}</p>
                  <ul className="mt-4 grid gap-1.5 text-sm text-ink/80">
                    <li>Study courses following the curriculum</li>
                    <li>Question bank with chart questions</li>
                    <li>Timed exam mode</li>
                  </ul>
                  <p className="mt-5">
                    {live.length ? (
                      <span className="rounded-full bg-accent px-3 py-1 text-xs font-semibold text-ink">Question Bank available now</span>
                    ) : (
                      <span className="rounded-full bg-surface px-3 py-1 text-xs font-semibold text-muted">Coming soon</span>
                    )}
                  </p>
                  <Link href={`/programmes/${l.slug}`} className="fc-btn fc-btn-primary mt-auto !mt-6">Explore Level {l.n} &rarr;</Link>
                </div>
              );
            })}
          </div>
          <div className="text-center"><Link href={SAMPLE} className="fc-btn fc-btn-primary">Start Practising</Link></div>
        </div>
      </section>

      {/* the exams */}
      <section className="bg-white">
        <div className="fc-container grid gap-10 py-20">
          <SectionHeading label="The CMT Program" title="Three exams, taken in order"
            sub={<>Offered by the CMT Association twice a year, in June and December. Exam details as published by the CMT Association; check <a href="https://cmtassociation.org/cmt-program/" target="_blank" rel="noopener" className="underline">cmtassociation.org</a> for the latest.</>} />
          <div className="grid gap-4 md:grid-cols-3">
            {LEVELS.map((l) => (
              <div key={l.level} className="rounded-2xl border border-line p-6">
                <p className="text-sm font-semibold uppercase tracking-[0.14em] text-primary">{l.level}</p>
                <p className="mt-3 text-xl font-semibold text-ink">{l.format}</p>
                <p className="text-sm text-muted">{l.time}</p>
                <p className="mt-4 text-[15px] leading-relaxed text-ink/85">{l.focus}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="bg-white">
        <div className="fc-container grid max-w-3xl gap-8 py-20">
          <SectionHeading label="Questions" title="Frequently asked" />
          <div className="divide-y divide-line rounded-2xl border border-line">
            {FAQ.map(([q, a]) => (
              <details key={q} className="group p-5">
                <summary className="cursor-pointer list-none text-[17px] font-semibold text-ink">{q}<span className="float-right text-primary group-open:rotate-45">+</span></summary>
                <div className="mt-3 text-[15px] leading-relaxed text-ink/85">{a}</div>
              </details>
            ))}
          </div>
          <p className="text-xs leading-relaxed text-muted">{cmtDisclaimer()}</p>
        </div>
      </section>
    </>
  );
}
