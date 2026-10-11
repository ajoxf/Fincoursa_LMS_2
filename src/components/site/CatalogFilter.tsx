"use client";
import { useState } from "react";
import type { CourseCard as Course } from "@/lib/catalog";
import { CourseCard } from "./CourseCard";

export function CatalogFilter({ courses }: { courses: Course[] }) {
  const categories = Array.from(new Set(courses.map((c) => c.category).filter(Boolean))) as string[];
  const [active, setActive] = useState<string | null>(null);
  const shown = active ? courses.filter((c) => c.category === active) : courses;
  return (
    <>
      <div className="flex flex-wrap justify-center gap-3">
        {[null, ...categories].map((c) => (
          <button key={c ?? "all"} onClick={() => setActive(c)}
            className={`rounded-full px-3.5 py-1.5 text-[15px] transition ${active === c ? "bg-black text-white" : "bg-white text-ink hover:bg-white/70"}`}>
            {c ?? "All Products"}
          </button>
        ))}
      </div>
      <div className="mx-auto mt-10 grid max-w-[968px] gap-4">
        {shown.map((c) => <CourseCard key={c.id} course={c} />)}
      </div>
    </>
  );
}
