const items = [
  { q: "Can I buy just one course?", a: "Yes — that's how FinCoursa works by default. Tick any courses you want, build a custom bundle, and check out. Or open a single course and enroll directly. No subscription required." },
  { q: "Do I need a specific background?", a: "No specific background is required. Our courses are designed for learners with different levels of experience." },
  { q: "Do you offer team or university pricing?", a: "Yes. We offer flexible pricing options for teams, universities, and other organizations." },
  { q: "What if a course isn't right for me?", a: "If a course doesn't meet your expectations, please contact our support team and we'll help you find the right option." },
];

export function Faq() {
  return (
    <div className="divide-y divide-line rounded-card border border-line">
      {items.map((it) => (
        <details key={it.q} className="group p-5">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold text-primary">
            {it.q}<span className="text-xl transition group-open:rotate-45" aria-hidden>+</span>
          </summary>
          <p className="mt-3 text-muted">{it.a}</p>
        </details>
      ))}
    </div>
  );
}
