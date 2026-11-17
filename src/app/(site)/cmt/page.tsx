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
  { level: "Level I", n: 1, slug: "cmt-level-1" },
  { level: "Level II", n: 2, slug: "cmt-level-2" },
  { level: "Level III", n: 3, slug: "cmt-level-3" },
];
/** "CMT Level II: Trend Analysis" → "Trend Analysis"; "CMT Level 2 - Question Bank" → "Question Bank" */
const shortTitle = (t: string) => t.replace(/^CMT Level [IV\d]+\s*[:\-–]\s*/i, "");
const isLive = (c?: CourseCard) => Boolean(c && !c.comingSoon);

// Exam facts as published by the CMT Association (cmtassociation.org); checked November 2026.
const LEVELS = [
  { level: "Level I", format: "132 multiple-choice questions", time: "2 hours", focus: "The vocabulary and building blocks of technical analysis: chart types, trends, patterns, indicators and the theory behind them." },
  { level: "Level II", format: "170 multiple-choice questions", time: "4 hours", focus: "Applying the tools: reading charts, combining indicators, relative strength, market internals, cycles and testing a trading approach." },
  { level: "Level III", format: "Short essays and multiple-choice questions", time: "4 hours", focus: "Judgement: building a view across markets, risk management and portfolio decisions, explained in writing." },
];

const STEPS = [
  ["Learn the curriculum", "Work through the official CMT readings for your level, section by section. Our questions follow the same order, so you can practise as you go."],
  ["Practise every section", "Answer exam-style questions on each topic. Every answer comes with a worked explanation of why it is right and why the other options are not."],
  ["Read real charts", "Chart questions ask you to read the chart to find the answer, as the exam does, so pattern recognition becomes second nature."],
  ["Sit timed exams", "Switch to timed exam mode to build pace and stamina, flag questions to revisit, and see where you lose marks before exam day."],
];

const FAQ: [string, React.ReactNode][] = [
  ["What is the CMT?", <>The Chartered Market Technician (CMT) is a professional designation in technical analysis, awarded by the CMT Association. Candidates pass three exams (Level I, II and III), taken in order, and meet the Association&apos;s membership and work-experience requirements.</>],
  ["When are the exams?", <>The CMT Association offers the exams twice a year, in June and December. For June 2027 it lists Level I and II from 1 to 17 June and Level III on 3 June. Always check dates and registration deadlines at <a href="https://cmtassociation.org/cmt-program/register/" target="_blank" rel="noopener" className="underline">cmtassociation.org</a>.</>],
  ["How much does registration cost?", <>The CMT Association sets the fees, which depend on when you register. For June 2027 it lists US$875 (early, until 24 February 2027), US$1,075 (standard, until 31 March) and US$1,475 (late, until 20 April) per level. These are paid to the CMT Association, not to FinCoursa.</>],
  ["Do I still need the official curriculum?", <>Yes. FinCoursa materials help you practise and check your understanding; they do not replace the CMT Association&apos;s curriculum and readings.</>],
  ["Which levels do you cover?", <>There is a CMT programme for each level: a study course for every section of the curriculum, then a question bank. The Level II Question Bank is available now; the rest are coming soon, and you can ask to be told when each one opens from its course page.</>],
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
                {CMT_PPP.BADGE && <img src={CMT_PPP.BADGE} alt="CMT Association Participating Prep Provider" className="mb-4 h-20 w-auto" />}
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
            sub="Each programme has a study course for every section of the curriculum, then the level's question bank. Start today with the Level II Question Bank and its complimentary sample questions." />
          <div className="grid items-start gap-4 lg:grid-cols-3">
            {track.map((l) => (
              <div key={l.level} className="flex h-full flex-col rounded-2xl bg-white p-6">
                <p className="text-sm font-semibold uppercase tracking-[0.14em] text-primary">{l.level}</p>
                <h3 className="mt-1 text-xl font-semibold text-ink">CMT {l.level} Programme</h3>
                <p className="mt-1 text-sm text-muted">{l.programme ? `${l.programme.courses.length} courses` : ""}{l.programme?.comingSoon ? " · Coming soon" : ""}</p>
                <ul className="mt-4 grid gap-1.5 text-[15px]">
                  {(l.programme?.courses ?? []).map((c) => {
                    const live = isLive(c);
                    return (
                      <li key={c.id}>
                        <Link href={`/courses/${c.slug}`} className="flex items-start justify-between gap-3 rounded-lg px-2 py-1.5 hover:bg-surface">
                          <span className={live ? "font-semibold text-ink" : "text-ink/85"}>{shortTitle(c.title)}</span>
                          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${live ? "bg-accent text-ink" : "bg-surface text-muted"}`}>{live ? "Available now" : "Coming soon"}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
                <Link href={`/programmes/${l.slug}`} className="fc-btn fc-btn-primary mt-auto !mt-6">Explore Level {l.n} &rarr;</Link>
              </div>
            ))}
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

      {/* how to prepare */}
      <section className="bg-surface-dark text-white">
        <div className="fc-container grid gap-10 py-20">
          <SectionHeading dark label="How to Prepare" title="A study plan that works" />
          <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map(([t, d], i) => (
              <li key={t} className="rounded-2xl border border-white/15 p-6">
                <p className="text-3xl font-bold text-accent">{i + 1}</p>
                <p className="mt-3 text-lg font-semibold">{t}</p>
                <p className="mt-2 text-[15px] leading-relaxed text-white/80">{d}</p>
              </li>
            ))}
          </ol>
          <div className="text-center">
            <Link href={SAMPLE} className="fc-btn fc-btn-primary fc-btn-lg inline-flex">Start Practising</Link>
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
