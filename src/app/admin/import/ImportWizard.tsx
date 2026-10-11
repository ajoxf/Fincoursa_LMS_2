"use client";
import { useState } from "react";
import Papa from "papaparse";
import { detectColumns, FIELDS, missingRequired, type Kind } from "@/lib/thinkific/columns";
import { analyseProducts, pendingInvites, runImportChunk, sendInviteBatch, type ProductMatch } from "./actions";

type Row = Record<string, string>;
type Parsed = { file: string; headers: string[]; rows: Row[] };
const STEPS: { kind: Kind; title: string; hint: string }[] = [
  { kind: "users", title: "1 · Students", hint: "Thinkific → Users → Export (CSV)" },
  { kind: "enrollments", title: "2 · Enrolments & progress", hint: "Thinkific → Reports / Enrollments → Export (CSV)" },
  { kind: "orders", title: "3 · Orders", hint: "Thinkific → Orders → Export (CSV)" },
];
const CHUNK = 100;

export function ImportWizard() {
  return (
    <div className="grid gap-6">
      {STEPS.map((s) => <Step key={s.kind} {...s} />)}
      <Invites />
    </div>
  );
}

function Step({ kind, title, hint }: { kind: Kind; title: string; hint: string }) {
  const [data, setData] = useState<Parsed | null>(null);
  const [cols, setCols] = useState<Record<string, string | null>>({});
  const [products, setProducts] = useState<ProductMatch[] | null>(null);
  const [options, setOptions] = useState<{ value: string; label: string }[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [currency, setCurrency] = useState("USD");
  const [progress, setProgress] = useState<{ done: number; created: number; updated: number; skipped: number; errors: { row: number; message: string }[] } | null>(null);
  const [running, setRunning] = useState(false);

  const productCol = kind === "enrollments" ? cols.course : kind === "orders" ? cols.product : null;

  async function onFile(f: File) {
    setProgress(null); setProducts(null);
    Papa.parse<Row>(f, {
      header: true, skipEmptyLines: true,
      complete: async (res) => {
        const headers = res.meta.fields ?? [];
        const detected = detectColumns(kind, headers);
        setData({ file: f.name, headers, rows: res.data });
        setCols(detected);
        await refreshProducts(res.data, detected, mapping);
      },
    });
  }

  async function refreshProducts(rows: Row[], c: Record<string, string | null>, m: Record<string, string>) {
    const col = kind === "enrollments" ? c.course : kind === "orders" ? c.product : null;
    if (!col) return;
    const counts = new Map<string, number>();
    rows.forEach((r) => { const n = (r[col] ?? "").trim(); if (n) counts.set(n, (counts.get(n) ?? 0) + 1); });
    const res = await analyseProducts([...counts].map(([name, rows]) => ({ name, rows })), m);
    setProducts(res.products); setOptions(res.options);
  }

  async function run() {
    if (!data) return;
    setRunning(true);
    const acc = { done: 0, created: 0, updated: 0, skipped: 0, errors: [] as { row: number; message: string }[] };
    setProgress({ ...acc });
    for (let i = 0; i < data.rows.length; i += CHUNK) {
      const r = await runImportChunk(kind, data.rows.slice(i, i + CHUNK), cols, mapping, currency, i);
      acc.done = Math.min(data.rows.length, i + CHUNK); acc.created += r.created; acc.updated += r.updated; acc.skipped += r.skipped; acc.errors.push(...r.errors);
      setProgress({ ...acc, errors: [...acc.errors] });
    }
    setRunning(false);
  }

  const missing = data ? missingRequired(kind, cols) : [];
  const unmatched = (products ?? []).filter((p) => !p.match);
  const invalidEmails = data && cols.email ? data.rows.filter((r) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((r[cols.email!] ?? "").trim())).length : 0;

  return (
    <section className="fc-card grid gap-4 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold text-primary">{title}</h2>
        <span className="text-xs text-muted">{hint}</span>
      </div>
      <label className="flex flex-wrap items-center gap-3 text-sm">
        <input type="file" accept=".csv,text/csv" className="block w-full max-w-full text-sm" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
        {data && <span className="text-muted">{data.file}: {data.rows.length.toLocaleString()} rows</span>}
      </label>

      {data && (
        <>
          <div>
            <p className="text-sm font-medium">Columns found</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {Object.entries(FIELDS[kind]).map(([key, f]) => (
                <label key={key} className="grid gap-1 text-xs">
                  <span>{f.label}{f.required && <span className="text-danger"> *</span>}</span>
                  <select value={cols[key] ?? ""} className="fc-input !py-1.5"
                    onChange={(e) => { const c = { ...cols, [key]: e.target.value || null }; setCols(c); if (key === "course" || key === "product") refreshProducts(data.rows, c, mapping); }}>
                    <option value="">(not in file)</option>
                    {data.headers.map((h) => <option key={h} value={h}>{h}</option>)}
                  </select>
                </label>
              ))}
            </div>
            {missing.length > 0 && <p className="mt-2 text-sm text-danger">Choose a column for: {missing.join(", ")}</p>}
            {invalidEmails > 0 && <p className="mt-2 text-sm text-warning">{invalidEmails} rows have no valid email and will be skipped.</p>}
          </div>

          {productCol && products && (
            <div>
              <p className="text-sm font-medium">Match Thinkific products to courses here</p>
              <p className="text-xs text-muted">Matched automatically by name. Fix any that are wrong; choose “Skip” for products you&apos;re not bringing over.</p>
              <div className="mt-2 divide-y divide-line rounded-md border border-line">
                {products.map((p) => (
                  <div key={p.name} className="flex flex-wrap items-center justify-between gap-3 p-2 text-sm">
                    <span className={p.match ? "" : "font-medium text-danger"}>{p.name} <span className="text-xs text-muted">({p.rows} rows)</span></span>
                    <select value={mapping[p.name] ?? p.match ?? ""} className="fc-input w-auto !py-1"
                      onChange={async (e) => { const m = { ...mapping, [p.name]: e.target.value }; setMapping(m); await refreshProducts(data.rows, cols, m); }}>
                      <option value="">Not matched: choose…</option>
                      <option value="skip">Skip</option>
                      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                ))}
              </div>
              {unmatched.length > 0 && <p className="mt-2 text-sm text-warning">{unmatched.length} products aren&apos;t matched; their rows will be reported as errors.</p>}
            </div>
          )}

          {kind === "orders" && (
            <label className="flex items-center gap-2 text-sm">Currency of the Thinkific store (used when the file has no currency column)
              <input value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase().slice(0, 3))} className="fc-input w-20 !py-1 uppercase" />
            </label>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <button disabled={running || missing.length > 0} onClick={run} className="fc-btn fc-btn-primary">
              {running ? "Importing…" : `Import ${data.rows.length.toLocaleString()} rows`}
            </button>
            {kind === "orders" && <span className="text-xs text-muted">Historical orders don&apos;t create instructor earnings or partner commissions.</span>}
          </div>
        </>
      )}

      {progress && data && (
        <div className="grid gap-2 text-sm">
          <div className="h-2 rounded-full bg-surface"><div className="h-2 rounded-full bg-accent transition-all" style={{ width: `${(progress.done / Math.max(1, data.rows.length)) * 100}%` }} /></div>
          <p>{progress.done.toLocaleString()} / {data.rows.length.toLocaleString()} rows · <b>{progress.created}</b> created · <b>{progress.updated}</b> updated · {progress.skipped} skipped · <span className={progress.errors.length ? "text-danger" : ""}>{progress.errors.length} errors</span></p>
          {progress.errors.length > 0 && (
            <details>
              <summary className="cursor-pointer text-xs underline">Show errors</summary>
              <ul className="mt-2 max-h-48 overflow-auto text-xs">{progress.errors.slice(0, 500).map((e, i) => <li key={i}>Row {e.row}: {e.message}</li>)}</ul>
            </details>
          )}
        </div>
      )}
    </section>
  );
}

function Invites() {
  const [state, setState] = useState<{ pending?: number; sent: number; running: boolean }>({ sent: 0, running: false });
  return (
    <section className="fc-card grid gap-3 p-5">
      <h2 className="text-lg font-semibold text-primary">4 · Tell students they&apos;ve moved</h2>
      <p className="text-sm text-muted">Sends each migrated student one &ldquo;we&apos;ve moved&rdquo; email. The button in it opens the sign-in page with their email filled in and sends them a fresh one-click link, so invites never expire. Each student gets it once, even if you click again.</p>
      <div className="flex flex-wrap items-center gap-3">
        <button className="fc-btn fc-btn-outline" disabled={state.running} onClick={async () => setState({ ...state, pending: await pendingInvites() })}>Check who&apos;s waiting</button>
        <button className="fc-btn fc-btn-primary" disabled={state.running || !state.pending}
          onClick={async () => {
            setState((s) => ({ ...s, running: true }));
            let remaining = state.pending ?? 0, sent = 0;
            while (remaining > 0) { const r = await sendInviteBatch(25); sent += r.sent; remaining = r.remaining; setState({ pending: remaining, sent, running: true }); if (r.sent === 0) break; }
            setState((s) => ({ ...s, running: false }));
          }}>
          {state.running ? "Sending…" : "Send invitations"}
        </button>
        {state.pending !== undefined && <span className="text-sm">{state.pending} waiting · {state.sent} sent</span>}
      </div>
    </section>
  );
}
