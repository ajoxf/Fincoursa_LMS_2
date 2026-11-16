"use client";
import { useState } from "react";
import type { AudiencePerson } from "./actions";

const STATUS: Record<string, string> = { pending: "Waiting", sent: "Sent", failed: "Failed", skipped: "Not delivered" };

/** A list of recipients with a search box and a CSV download. */
export function PeopleList({ people, note }: { people: AudiencePerson[]; note?: string }) {
  const [q, setQ] = useState("");
  const shown = people.filter((p) => !q || `${p.name ?? ""} ${p.email}`.toLowerCase().includes(q.toLowerCase()));
  const hasStatus = people.some((p) => p.status);
  const csv = () => {
    const cell = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const lines = ["name,email,type" + (hasStatus ? ",status" : ""), ...people.map((p) => [p.name ?? "", p.email, p.type, ...(hasStatus ? [STATUS[p.status ?? ""] ?? p.status ?? ""] : [])].map(cell).join(","))];
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" }));
    a.download = "recipients.csv";
    a.click();
  };
  return (
    <div className="grid w-full gap-2 rounded-xl border border-line p-3 text-left text-sm">
      {note && <p className="text-xs text-muted">{note}</p>}
      {people.length > 8 && <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or email" className="fc-input !py-1.5 text-sm" />}
      {!people.length ? <p className="text-muted">Nobody yet.</p> : (
        <ul className="max-h-80 divide-y divide-line overflow-y-auto">
          {shown.slice(0, 500).map((p) => (
            <li key={p.email} className="flex flex-wrap items-baseline justify-between gap-x-3 py-1.5">
              <span className="min-w-0 break-all"><span className="font-medium text-ink">{p.name || p.email}</span>{p.name && <span className="text-muted"> · {p.email}</span>}</span>
              <span className="text-xs text-muted">{p.type}{p.status ? ` · ${STATUS[p.status] ?? p.status}` : ""}</span>
            </li>
          ))}
        </ul>
      )}
      {shown.length > 500 && <p className="text-xs text-muted">Showing 500 of {shown.length}. Search, or download the full list.</p>}
      {people.length > 0 && <button type="button" onClick={csv} className="justify-self-start text-xs underline">Download as CSV</button>}
    </div>
  );
}
