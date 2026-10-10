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
    <div>
      <div role="tablist" className="flex flex-wrap gap-2">
        {tabs.map((x) => (
          <button key={x.id} role="tab" aria-selected={x.id === active} onClick={() => setActive(x.id)}
            className={`rounded-button px-4 py-2 text-sm font-medium transition ${x.id === active ? "bg-accent text-accent-contrast" : "bg-white/10 text-on-dark hover:bg-white/15"}`}>
            {x.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" className="mt-6 rounded-card bg-white/5 p-6 ring-1 ring-white/10">
        <h3 className="text-xl font-semibold text-white">{t.title}</h3>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {t.bullets.map((b) => (
            <li key={b} className="flex items-center gap-2 text-on-dark"><span className="text-accent" aria-hidden>✓</span>{b}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
