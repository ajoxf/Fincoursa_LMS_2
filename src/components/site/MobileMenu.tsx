"use client";
import Link from "next/link";
import { useState } from "react";

type L = { href: string; label: string };

export function MobileMenu({ signedIn, learnLinks, mainLinks }: { signedIn: boolean; learnLinks: L[]; mainLinks: L[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="md:hidden">
      <button aria-label="Menu" aria-expanded={open} onClick={() => setOpen(!open)} className="p-2 text-2xl leading-none">
        {open ? "×" : "☰"}
      </button>
      {open && (
        <div className="absolute inset-x-0 top-16 border-b border-line bg-bg shadow-lg">
          <nav className="fc-container flex flex-col py-3 text-sm font-medium" onClick={() => setOpen(false)}>
            <span className="px-1 pt-2 text-xs uppercase text-muted">Learn</span>
            {learnLinks.map((l) => <Link key={l.href} href={l.href} className="px-1 py-2">{l.label}</Link>)}
            {mainLinks.map((l) => <Link key={l.href} href={l.href} className="px-1 py-2">{l.label}</Link>)}
            {signedIn ? (
              <Link href="/dashboard" className="fc-btn fc-btn-dark mt-2">My Dashboard</Link>
            ) : (
              <>
                <Link href="/users/sign_in" className="px-1 py-2">Login</Link>
                <Link href="/users/sign_in" className="fc-btn fc-btn-dark mt-2">Sign In</Link>
              </>
            )}
          </nav>
        </div>
      )}
    </div>
  );
}
