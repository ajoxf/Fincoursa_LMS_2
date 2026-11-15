"use client";
import { useState, useSyncExternalStore } from "react";
import type { CourseCard as Course } from "@/lib/catalog";
import { CourseCard, CourseGridCard } from "./CourseCard";

type View = "list" | "grid";
const KEY = "fc_catalog_view";
const listeners = new Set<() => void>();
const memory: { view: View | null } = { view: null }; // used when the browser blocks storage
const setView = (v: View) => { memory.view = v; try { localStorage.setItem(KEY, v); } catch { /* storage blocked */ } listeners.forEach((fn) => fn()); };
const readView = (): View => { if (memory.view) return memory.view; try { return localStorage.getItem(KEY) === "list" ? "list" : "grid"; } catch { return "grid"; } };
const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };

/** Course catalogue: filter pills, and a List / Grid switch. The grid groups courses under their category. */
export function CatalogFilter({ courses, filters = true }: { courses: Course[]; filters?: boolean }) {
  // Filter pills: categories first, then tags not already used as a category name
  const categories = Array.from(new Set(courses.map((c) => c.category).filter(Boolean))) as string[];
  const lower = new Set(categories.map((c) => c.toLowerCase()));
  const tags = Array.from(new Set(courses.flatMap((c) => c.tags ?? []))).filter((t) => !lower.has(t.toLowerCase())).sort();
  const [active, setActive] = useState<string | null>(null);
  // grid by default; each visitor's choice is remembered in their browser
  const view = useSyncExternalStore(subscribe, readView, () => "grid" as View);
  const choose = setView;
  const shown = active ? courses.filter((c) => c.category === active || (c.tags ?? []).includes(active)) : courses;

  // grid: one group per category, in the admin's category order; uncategorised courses last under "More courses"
  const groups = new Map<string, { order: number; items: Course[] }>();
  for (const c of shown) {
    const k = c.category ?? "More courses";
    const g = groups.get(k) ?? { order: c.category ? c.categoryOrder ?? 999 : 1000, items: [] };
    g.items.push(c); groups.set(k, g);
  }
  const grouped = [...groups.entries()].sort((a, b) => a[1].order - b[1].order);

  return (
    <>
      <div className="flex flex-col items-center gap-5">
        {filters && (
          <div className="flex flex-wrap justify-center gap-3">
            {[null, ...categories, ...tags].map((c) => (
              <button key={c ?? "all"} onClick={() => setActive(c)}
                className={`rounded-full px-3.5 py-1.5 text-[15px] transition ${active === c ? "bg-black text-white" : "bg-white text-ink hover:bg-white/70"}`}>
                {c ?? "All Products"}
              </button>
            ))}
          </div>
        )}
        <div role="group" aria-label="Layout" className="inline-flex rounded-full bg-white p-1 text-sm">
          {(["list", "grid"] as const).map((v) => (
            <button key={v} type="button" aria-pressed={view === v} onClick={() => choose(v)}
              className={`flex items-center gap-2 rounded-full px-4 py-1.5 transition ${view === v ? "bg-ink text-white" : "text-ink hover:bg-surface"}`}>
              {v === "list" ? (
                <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden fill="currentColor"><rect y="1" width="14" height="3" rx="1" /><rect y="6" width="14" height="3" rx="1" /><rect y="11" width="14" height="2" rx="1" /></svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden fill="currentColor"><rect width="6" height="6" rx="1" /><rect x="8" width="6" height="6" rx="1" /><rect y="8" width="6" height="6" rx="1" /><rect x="8" y="8" width="6" height="6" rx="1" /></svg>
              )}
              {v === "list" ? "List" : "Grid"}
            </button>
          ))}
        </div>
      </div>

      {view === "list" ? (
        <div className="mx-auto mt-10 grid max-w-[968px] gap-4">
          {shown.map((c) => <CourseCard key={c.id} course={c} />)}
        </div>
      ) : (
        <div className="mx-auto mt-10 grid max-w-[1200px] gap-14">
          {grouped.map(([name, g]) => (
            <section key={name} aria-label={name}>
              <div className="mb-5 flex items-baseline justify-between gap-4 border-b border-ink/15 pb-3">
                <h3 className="text-2xl font-normal tracking-tight text-ink">{name}</h3>
                <span className="text-sm text-ink/60">{g.items.length} {g.items.length === 1 ? "course" : "courses"}</span>
              </div>
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {g.items.map((c) => <CourseGridCard key={c.id} course={c} />)}
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
