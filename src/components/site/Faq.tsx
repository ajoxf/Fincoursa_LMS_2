import type { FaqItem } from "@/lib/home-content";

export function Faq({ items }: { items: FaqItem[] }) {
  return (
    <div className="divide-y divide-ink/15 border-b border-ink/15">
      {items.map((it, i) => (
        <details key={i} className="group px-5 py-5" open={i === 0}>
          <summary className="flex cursor-pointer list-none items-start justify-between gap-6 text-xl font-normal tracking-tight text-ink md:text-[22px]">
            {it.q}
            <span aria-hidden className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#e2e8f0] text-sm leading-none">
              <span className="group-open:hidden">+</span><span className="hidden group-open:inline">−</span>
            </span>
          </summary>
          <p className="mt-3 max-w-[680px] whitespace-pre-line text-[15px] leading-relaxed text-ink/85">{it.a}</p>
        </details>
      ))}
    </div>
  );
}
