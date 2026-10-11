"use client";
import { Logo } from "@/components/site/Logo";
import Link from "next/link";
import { useEffect, useState } from "react";
import { brand } from "./brand";

type L = { href: string; label: string };
type U = { name: string; isAdmin: boolean; isInstructor: boolean; isPartner: boolean } | null;

/** "Fincoursa Team" → "Fincoursa T" (as fincoursa.com shows it) */
function shortName(n: string) {
  const parts = n.trim().split(/\s+/);
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}` : parts[0];
}

export function HeaderBar({ learnLinks, mainLinks, user }: { learnLinks: L[]; mainLinks: L[]; user: U }) {
  // Black bar at the top of the page; once scrolled it becomes a floating white bar.
  const [scrolled, setScrolled] = useState(false);
  const [menu, setMenu] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 40);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);

  const light = scrolled;
  const initial = user ? (user.name.trim()[0] ?? "").toUpperCase() : "";

  return (
    <header className={`sticky top-0 z-40 transition-colors ${light ? "bg-transparent" : "bg-surface-dark"}`}>
      <div className={`mx-auto transition-all duration-300 ${light ? "mt-3 max-w-[var(--fc-container)] px-3 md:px-4" : "max-w-full"}`}>
        <div className={`relative flex h-[68px] items-center justify-between gap-6 transition-all duration-300 ${
          light ? "rounded-xl bg-white px-4 text-ink shadow-[0_8px_30px_rgba(0,0,0,.12)] md:px-5" : "fc-container text-white"}`}>
          <Link href="/" aria-label={brand.name} className="shrink-0">
            <Logo tone={light ? "dark" : "light"} />
          </Link>

          <nav className="hidden items-center gap-10 text-sm md:flex">
            <div className="group relative">
              <button className="flex items-center gap-1.5 py-6" aria-haspopup="true">
                Learn
                <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden className={light ? "text-ink" : "text-accent"}>
                  <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <div className="invisible absolute left-0 top-full min-w-48 rounded-xl bg-white p-2 text-ink opacity-0 shadow-lg ring-1 ring-black/5 transition group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
                {learnLinks.map((l) => (
                  <Link key={l.href} href={l.href} className="block rounded-lg px-3 py-2 hover:bg-surface">{l.label}</Link>
                ))}
              </div>
            </div>
            {mainLinks.map((l) => <Link key={l.href} href={l.href} className="hover:opacity-70">{l.label}</Link>)}
          </nav>

          <div className="hidden items-center md:flex">
            {user ? (
              <div className="relative">
                <button onClick={() => setMenu(!menu)} onBlur={() => setTimeout(() => setMenu(false), 150)}
                  className="flex items-center gap-2.5 text-[15px]" aria-haspopup="menu" aria-expanded={menu}>
                  {shortName(user.name)}
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#c4401a] text-sm text-white">{initial}</span>
                  <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden><path d="M1 3h8L5 7.5z" fill="currentColor" /></svg>
                </button>
                {menu && (
                  <div role="menu" className="absolute right-0 top-full mt-3 min-w-52 rounded-xl bg-white p-2 text-sm text-ink shadow-lg ring-1 ring-black/5">
                    <Link role="menuitem" href="/dashboard" className="block rounded-lg px-3 py-2 hover:bg-surface">My Dashboard</Link>
                    <Link role="menuitem" href="/dashboard/certificates" className="block rounded-lg px-3 py-2 hover:bg-surface">Certificates</Link>
                    {user.isPartner && <Link role="menuitem" href="/affiliate" className="block rounded-lg px-3 py-2 hover:bg-surface">Partner dashboard</Link>}
                    {user.isInstructor && <Link role="menuitem" href="/instructor" className="block rounded-lg px-3 py-2 hover:bg-surface">Instructor dashboard</Link>}
                    {user.isAdmin && <Link role="menuitem" href="/admin" className="block rounded-lg px-3 py-2 hover:bg-surface">Admin</Link>}
                    <Link role="menuitem" href="/dashboard/settings" className="block rounded-lg px-3 py-2 hover:bg-surface">Account settings</Link>
                    <a role="menuitem" href="/auth/sign-out" className="block rounded-lg px-3 py-2 hover:bg-surface">Sign out</a>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-6 text-sm">
                <Link href="/users/sign_in" className="hover:opacity-70">Sign In</Link>
                <Link href="/users/sign_up" className="fc-btn fc-btn-primary !min-w-0 !px-5 !py-2.5">Sign Up</Link>
              </div>
            )}
          </div>

          {/* Mobile */}
          <button aria-label="Menu" aria-expanded={menu} onClick={() => setMenu(!menu)} className="p-2 text-2xl leading-none md:hidden">
            {menu ? "×" : "☰"}
          </button>
          {menu && (
            <nav className="absolute inset-x-0 top-full mt-2 flex flex-col rounded-xl bg-white p-3 text-sm text-ink shadow-lg ring-1 ring-black/5 md:hidden" onClick={() => setMenu(false)}>
              <span className="px-2 pt-1 text-xs uppercase tracking-wider text-muted">Learn</span>
              {learnLinks.map((l) => <Link key={l.href} href={l.href} className="px-2 py-2">{l.label}</Link>)}
              {mainLinks.map((l) => <Link key={l.href} href={l.href} className="px-2 py-2">{l.label}</Link>)}
              {user ? (
                <Link href="/dashboard" className="fc-btn fc-btn-primary mt-2">My Dashboard</Link>
              ) : (
                <>
                  <Link href="/users/sign_in" className="px-2 py-2">Sign In</Link>
                  <Link href="/users/sign_up" className="fc-btn fc-btn-primary mt-2">Sign Up</Link>
                </>
              )}
            </nav>
          )}
        </div>
      </div>
    </header>
  );
}
