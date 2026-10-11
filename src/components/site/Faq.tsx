const items = [
  { q: "Can I buy just one course?", a: "Yes — that's how FinCoursa works by default. Tick any courses you want, build a custom bundle, and check out. Or open a single course and enroll directly. No subscription required." },
  { q: "Do I need a specific background?", a: "No specific background is required. Our courses are designed for learners with different levels of experience." },
  { q: "Do you offer team or university pricing?", a: "Yes. We offer flexible pricing options for teams, universities, and other organizations." },
  { q: "What if a course isn’t right for me?", a: "If a course doesn't meet your expectations, please contact our support team and we'll help you find the right option." },
];

export function Faq() {
  return (
    <div className="divide-y divide-ink/15 border-b border-ink/15">
      {items.map((it, i) => (
        <details key={it.q} className="group px-5 py-5" open={i === 0}>
          <summary className="flex cursor-pointer list-none items-start justify-between gap-6 text-xl font-normal tracking-tight text-ink md:text-[22px]">
            {it.q}
            <span aria-hidden className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#e2e8f0] text-sm leading-none">
              <span className="group-open:hidden">+</span><span className="hidden group-open:inline">−</span>
            </span>
          </summary>
          <p className="mt-3 max-w-[680px] text-[15px] leading-relaxed text-ink/85">{it.a}</p>
        </details>
      ))}
    </div>
  );
}
