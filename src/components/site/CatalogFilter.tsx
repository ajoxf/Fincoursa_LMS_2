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
      <div className="flex flex-wrap gap-2">
        {[null, ...categories].map((c) => (
          <button key={c ?? "all"} onClick={() => setActive(c)}
            className={`rounded-button border px-4 py-2 text-sm font-medium ${active === c ? "border-primary bg-primary text-white" : "border-line hover:border-primary"}`}>
            {c ?? "All Products"}
          </button>
        ))}
      </div>
      <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((c) => <CourseCard key={c.id} course={c} />)}
      </div>
    </>
  );
}
