"use client";
import { useState } from "react";

/**
 * Single-series column chart (one hue, so no legend — the card title names it).
 * Thin bars with rounded tops on a zero baseline, recessive grid, hover tooltip,
 * and a "Table" toggle so values are never available only as colour/height.
 */
export function ColumnChart({ data, format = (n) => String(n), label, height = 180 }: {
  data: { x: string; y: number }[]; format?: (n: number) => string; label: string; height?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const max = Math.max(1, ...data.map((d) => d.y));
  const nice = niceMax(max);
  const W = 600, H = height, padL = 0, padB = 20, plotH = H - padB - 8;
  const step = (W - padL) / Math.max(data.length, 1);
  const barW = Math.max(2, Math.min(24, step - 2)); // 2px surface gap between bars
  const ticks = [0, nice / 2, nice];
  const every = Math.ceil(data.length / 6);

  return (
    <div>
      <div className="mb-2 flex justify-end">
        <button onClick={() => setTable(!table)} className="text-xs text-muted underline-offset-2 hover:underline">{table ? "Chart" : "Table"}</button>
      </div>
      {table ? (
        <div className="max-h-64 overflow-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-muted"><th className="py-1 font-medium">Date</th><th className="py-1 text-right font-medium">{label}</th></tr></thead>
            <tbody>{data.map((d) => <tr key={d.x} className="border-t border-line"><td className="py-1">{d.x}</td><td className="py-1 text-right tabular-nums">{format(d.y)}</td></tr>)}</tbody>
          </table>
        </div>
      ) : (
        <div className="relative">
          <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full overflow-visible" role="img" aria-label={label} onMouseLeave={() => setHover(null)}>
            {ticks.map((t) => {
              const y = 8 + plotH - (t / nice) * plotH;
              return <line key={t} x1={0} x2={W} y1={y} y2={y} stroke="var(--fc-border)" strokeWidth={1} />;
            })}
            {data.map((d, i) => {
              const h = (d.y / nice) * plotH;
              const x = padL + i * step + (step - barW) / 2;
              const y = 8 + plotH - h;
              const r = Math.min(4, barW / 2, h);
              return (
                <g key={d.x} onMouseEnter={() => setHover(i)}>
                  {/* hit target larger than the mark */}
                  <rect x={padL + i * step} y={0} width={step} height={H - padB} fill="transparent" />
                  {h > 0 && (
                    <path d={`M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + barW - r} Q${x + barW},${y} ${x + barW},${y + r} V${y + h} Z`}
                      fill="var(--fc-primary)" opacity={hover === null || hover === i ? 1 : 0.45} />
                  )}
                  {i % every === 0 && (
                    <text x={x + barW / 2} y={H - 4} textAnchor="middle" fontSize={11} fill="var(--fc-text-muted)">{d.x.slice(5)}</text>
                  )}
                </g>
              );
            })}
          </svg>
          <span className="absolute left-0 top-0 text-[11px] text-muted">{format(nice)}</span>
          {hover !== null && data[hover] && (
            <div className="pointer-events-none absolute -top-2 rounded-md border border-line bg-bg px-2 py-1 text-xs shadow"
              style={{ left: `${((hover + 0.5) / data.length) * 100}%`, transform: "translate(-50%, -100%)" }}>
              <div className="text-muted">{data[hover].x}</div>
              <div className="font-semibold tabular-nums">{format(data[hover].y)}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function niceMax(v: number) {
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}
