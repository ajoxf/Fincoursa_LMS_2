export function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div className="fc-card p-5">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-primary">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function Card({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="fc-card min-w-0 p-5">
      <div className="mb-4 flex items-center justify-between gap-4">
        <h2 className="font-semibold text-primary">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Progress({ pct }: { pct: number }) {
  const p = Math.max(0, Math.min(100, Math.round(pct)));
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 flex-1 rounded-full bg-surface" role="progressbar" aria-valuenow={p} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-2 rounded-full bg-accent" style={{ width: `${p}%` }} />
      </div>
      <span className="w-10 text-right text-xs tabular-nums text-muted">{p}%</span>
    </div>
  );
}

export function RangePicker({ current, base }: { current: number; base: string }) {
  return (
    <div className="flex gap-1 rounded-button border border-line p-1 text-xs">
      {[7, 30, 90, 365].map((d) => (
        <a key={d} href={`${base}${base.includes("?") ? "&" : "?"}days=${d}`}
          className={`rounded-button px-3 py-1 ${d === current ? "bg-primary text-white" : "hover:bg-surface"}`}>{d === 365 ? "1y" : `${d}d`}</a>
      ))}
    </div>
  );
}
