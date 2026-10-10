/** Ranked horizontal bars for breakdowns (by course, channel, gateway, country). Values are always printed. */
export function BarList({ rows, format = (n) => String(n), empty = "No data yet" }: {
  rows: { label: string; value: number; sub?: string }[]; format?: (n: number) => string; empty?: string;
}) {
  if (!rows.length) return <p className="py-6 text-center text-sm text-muted">{empty}</p>;
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="grid gap-3">
      {rows.map((r) => (
        <li key={r.label}>
          <div className="flex justify-between gap-4 text-sm">
            <span className="truncate">{r.label}</span>
            <span className="shrink-0 tabular-nums font-medium">{format(r.value)}{r.sub && <span className="ml-2 font-normal text-muted">{r.sub}</span>}</span>
          </div>
          <div className="mt-1 h-2 rounded-full bg-surface">
            <div className="h-2 rounded-full bg-primary" style={{ width: `${Math.max(1, (r.value / max) * 100)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
