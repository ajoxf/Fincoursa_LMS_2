"use client";
import { useState } from "react";
import { formatMoney } from "@/lib/money";
import type { AudiencePerson } from "./actions";

const STATUS: Record<string, string> = { pending: "Waiting", sent: "Sent", failed: "Failed", skipped: "Not delivered" };
const when = (d?: string | null) => (d ? new Date(d).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "");

type Filter = "all" | "opened" | "not_opened" | "clicked" | "converted";
const FILTERS: [Filter, string][] = [["all", "Everyone"], ["opened", "Opened"], ["not_opened", "Not opened"], ["clicked", "Clicked"], ["converted", "Signed up or bought"]];

/** Recipients with search, CSV download and, after sending, what each person did. */
export function PeopleList({ people, note }: { people: AudiencePerson[]; note?: string }) {
  const [q, setQ] = useState("");
  const [f, setF] = useState<Filter>("all");
  const tracked = people.some((p) => p.status);
  const match = (p: AudiencePerson) =>
    f === "all" || (f === "opened" && p.opened_at) || (f === "not_opened" && !p.opened_at) || (f === "clicked" && p.clicked_at)
    || (f === "converted" && (p.signed_up_at || p.sample_at || p.bought_at));
  const shown = people.filter((p) => match(p) && (!q || `${p.name ?? ""} ${p.email}`.toLowerCase().includes(q.toLowerCase())));
  const n = (k: keyof AudiencePerson) => people.filter((p) => p[k]).length;
  const revenue = people.reduce((a, p) => a + (p.revenue_minor ?? 0), 0);
  const cur = people.find((p) => p.currency)?.currency ?? undefined;

  const csv = () => {
    const cell = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const head = ["name", "email", "type", ...(tracked ? ["status", "opened", "opens", "clicked", "clicks", "signed up", "free sample", "bought", "revenue"] : [])];
    const lines = [head.join(","), ...people.map((p) => [p.name ?? "", p.email, p.type, ...(tracked ? [
      STATUS[p.status ?? ""] ?? p.status ?? "", when(p.opened_at), p.opens ?? 0, when(p.clicked_at), p.clicks ?? 0,
      when(p.signed_up_at), when(p.sample_at), when(p.bought_at), p.revenue_minor ? formatMoney(p.revenue_minor, p.currency ?? undefined) : "",
    ] : [])].map(cell).join(","))];
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" }));
    a.download = "recipients.csv";
    a.click();
  };

  const chip = (on: unknown, label: string, tone = "bg-surface text-ink") => on ? <span className={`rounded-full px-2 py-0.5 ${tone}`}>{label}</span> : null;

  return (
    <div className="grid w-full gap-2 rounded-xl border border-line p-3 text-left text-sm">
      {note && <p className="text-xs text-muted">{note}</p>}
      {tracked && (
        <div className="grid grid-cols-3 gap-2 text-center sm:grid-cols-6">
          {[["Sent", people.filter((p) => p.status === "sent").length], ["Opened", n("opened_at")], ["Clicked", n("clicked_at")],
            ["Signed up", n("signed_up_at")], ["Free sample", n("sample_at")], ["Bought", n("bought_at")]].map(([l, v]) => (
            <div key={l as string} className="rounded-lg bg-surface px-2 py-1.5"><b className="block text-base text-ink">{v}</b><span className="text-xs text-muted">{l}</span></div>
          ))}
        </div>
      )}
      {tracked && revenue > 0 && <p className="text-xs text-muted">Sales from these people within 30 days of the email: <b className="text-ink">{formatMoney(revenue, cur)}</b> (before tax)</p>}
      {tracked && (
        <div className="flex flex-wrap gap-1.5 text-xs">
          {FILTERS.map(([v, l]) => <button key={v} type="button" onClick={() => setF(v)} className={`rounded-full px-2.5 py-1 ${f === v ? "bg-ink text-white" : "bg-surface"}`}>{l}</button>)}
        </div>
      )}
      {people.length > 8 && <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or email" className="fc-input !py-1.5 text-sm" />}
      {!shown.length ? <p className="text-muted">{people.length ? "Nobody matches." : "Nobody yet."}</p> : (
        <ul className="max-h-96 divide-y divide-line overflow-y-auto">
          {shown.slice(0, 500).map((p) => (
            <li key={p.email} className="grid gap-1 py-2">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="min-w-0 break-all"><span className="font-medium text-ink">{p.name || p.email}</span>{p.name && <span className="text-muted"> · {p.email}</span>}</span>
                <span className="text-xs text-muted">{p.type}{p.status ? ` · ${STATUS[p.status] ?? p.status}` : ""}</span>
              </div>
              {tracked && (
                <div className="flex flex-wrap gap-1.5 text-xs">
                  {chip(p.opened_at, `Opened ${when(p.opened_at)}${(p.opens ?? 0) > 1 ? ` · ${p.opens} times` : ""}`)}
                  {chip(p.clicked_at, `Clicked ${when(p.clicked_at)}${(p.clicks ?? 0) > 1 ? ` · ${p.clicks} clicks` : ""}`, "bg-accent/30 text-ink")}
                  {chip(p.signed_up_at, `Signed up ${when(p.signed_up_at)}`, "bg-primary/10 text-primary")}
                  {chip(p.sample_at, `Tried the free sample ${when(p.sample_at)}`, "bg-primary/10 text-primary")}
                  {chip(p.bought_at, `Bought ${when(p.bought_at)}${p.revenue_minor ? ` · ${formatMoney(p.revenue_minor, p.currency ?? undefined)}` : ""}`, "bg-success/15 text-success")}
                  {p.status === "sent" && !p.opened_at && <span className="text-muted">Not opened yet</span>}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {shown.length > 500 && <p className="text-xs text-muted">Showing 500 of {shown.length}. Search, or download the full list.</p>}
      {people.length > 0 && <button type="button" onClick={csv} className="justify-self-start text-xs underline">Download as CSV</button>}
      {tracked && <p className="text-xs text-muted">Opens are a guide, not exact: some email apps open every email automatically (counted as opened), and some block images (not counted until they click). Signed up, free sample and bought count anything within 30 days of the email.</p>}
    </div>
  );
}
