"use client";
import { useState } from "react";

const tabs = [
  { id: "corporate", label: "Corporate training", title: "Upskill analysts, associates and whole teams at scale.",
    bullets: ["Volume seat licensing", "Team analytics & progress", "SSO & admin controls", "Dedicated success manager"] },
  { id: "university", label: "University & academic", title: "Give students practical skills that prepare them for the future.",
    bullets: ["Flexible student licensing", "Progress tracking", "Academic dashboards", "Faculty support"] },
  { id: "custom", label: "Custom programs", title: "Build a learning experience tailored to your organization.",
    bullets: ["Custom learning paths", "Branded programs", "Custom reporting", "Dedicated program support"] },
];

export function OrgTabs() {
  const [active, setActive] = useState(tabs[0].id);
  const t = tabs.find((x) => x.id === active)!;
  return (
    <div className="mx-auto grid max-w-[580px] gap-8 sm:grid-cols-[220px_1fr] sm:gap-10">
      <div role="tablist" aria-orientation="vertical" className="flex flex-col gap-3">
        {tabs.map((x) => (
          <button key={x.id} role="tab" aria-selected={x.id === active} onClick={() => setActive(x.id)}
            className={`rounded-full px-5 py-4 text-sm transition ${x.id === active ? "bg-white text-ink" : "bg-[#262626] text-white hover:bg-[#333]"}`}>
            {x.label}
          </button>
        ))}
      </div>
      <div role="tabpanel">
        <h3 className="text-xl font-normal leading-snug tracking-tight text-white">{t.title}</h3>
        <ul className="mt-4 grid gap-2.5">
          {t.bullets.map((b) => (
            <li key={b} className="flex items-center gap-3 text-sm text-white">
              <span aria-hidden className="flex h-5 w-5 items-center justify-center rounded-full bg-accent">
                <svg width="10" height="10" viewBox="0 0 10 10"><path d="M2 5.2 4.1 7.2 8 3" fill="none" stroke="#101827" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </span>
              {b}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
