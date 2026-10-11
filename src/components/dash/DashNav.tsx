"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

type Group = { title: string; items: { href: string; label: string }[] };

/** Sidebar on large screens; a compact "menu" button that opens the same list on phones. */
export function DashNav({ name, groups }: { name: string; groups: Group[] }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  // the most specific matching link is the current page
  const all = groups.flatMap((g) => g.items);
  const current = all.filter((i) => path === i.href || path.startsWith(i.href + "/")).sort((a, b) => b.href.length - a.href.length)[0];

  const list = (
    <nav className="grid gap-5 text-sm">
      {groups.map((g) => (
        <div key={g.title}>
          <p className="mb-1 text-xs uppercase tracking-wide text-muted">{g.title}</p>
          <div className="grid gap-0.5">
            {g.items.map((i) => {
              const active = current?.href === i.href;
              return (
                <Link key={i.href} href={i.href} onClick={() => setOpen(false)} aria-current={active ? "page" : undefined}
                  className={`rounded-md px-2 py-2 lg:py-1 ${active ? "bg-surface font-medium text-ink" : "text-ink/85 hover:bg-surface hover:text-ink"}`}>
                  {i.label}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
      <form action="/auth/sign-out" method="post"><button className="px-2 py-2 text-muted hover:underline lg:py-1">Sign out</button></form>
    </nav>
  );

  return (
    <>
      {/* phones and tablets */}
      <div className="lg:hidden">
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
          className="flex w-full items-center justify-between gap-3 rounded-xl border border-line bg-white px-4 py-3 text-left">
          <span className="min-w-0">
            <span className="block truncate text-xs text-muted">{name}</span>
            <span className="block truncate text-[15px] font-medium text-ink">{current?.label ?? "Menu"}</span>
          </span>
          <span className="flex shrink-0 items-center gap-2 text-sm font-medium">
            Menu
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden className={`transition ${open ? "rotate-180" : ""}`}><path d="M2 4.5 6 8l4-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </span>
        </button>
        {open && <div className="mt-2 rounded-xl border border-line bg-white p-3">{list}</div>}
      </div>
      {/* desktop sidebar */}
      <div className="hidden lg:block">
        <p className="truncate px-2 text-sm font-semibold">{name}</p>
        <div className="mt-4">{list}</div>
      </div>
    </>
  );
}
