import Link from "next/link";
import { brand } from "./brand";
import { getSessionUser } from "@/lib/auth";
import { MobileMenu } from "./MobileMenu";

export const learnLinks = [
  { href: "/pages/bundles", label: "Bundles" },
  { href: "/pages/free-courses", label: "free Course" },
  { href: "/pages/paid-courses", label: "Paid Courses" },
];

export const mainLinks = [
  { href: "/pages/instructors", label: "Instructors" },
  { href: "/#org-section", label: "For Organizations" },
  { href: "/pages/contact-us", label: "Contact" },
];

export async function SiteHeader() {
  const user = await getSessionUser();
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/95 backdrop-blur">
      <div className="fc-container flex h-16 items-center justify-between gap-6">
        <Link href="/" aria-label={brand.name} className="shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={brand.logoHeader} alt={brand.name} className="h-8 w-auto" />
        </Link>

        <nav className="hidden items-center gap-7 text-sm font-medium md:flex">
          <div className="group relative">
            <button className="flex items-center gap-1 py-5" aria-haspopup="true">
              Learn <span aria-hidden className="text-xs">▾</span>
            </button>
            <div className="invisible absolute left-0 top-full min-w-48 rounded-card border border-line bg-bg p-2 opacity-0 shadow-lg transition group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
              {learnLinks.map((l) => (
                <Link key={l.href} href={l.href} className="block rounded-md px-3 py-2 hover:bg-surface">{l.label}</Link>
              ))}
            </div>
          </div>
          {mainLinks.map((l) => <Link key={l.href} href={l.href} className="hover:text-accent">{l.label}</Link>)}
          {user ? (
            <Link href="/dashboard" className="fc-btn fc-btn-dark !py-2">My Dashboard</Link>
          ) : (
            <>
              <Link href="/users/sign_in" className="hover:text-accent">Login</Link>
              <Link href="/users/sign_in" className="fc-btn fc-btn-dark !py-2">Sign In</Link>
            </>
          )}
        </nav>

        <MobileMenu signedIn={Boolean(user)} learnLinks={learnLinks} mainLinks={mainLinks} />
      </div>
    </header>
  );
}
