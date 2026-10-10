import Link from "next/link";
import { brand } from "./brand";

const links = [
  { href: "/pages/bundles", label: "Bundles" },
  { href: "/pages/paid-courses", label: "Courses" },
  { href: "/pages/free-courses", label: "Free Courses" },
  { href: "/pages/instructors", label: "Instructors" },
  { href: "/#org-section", label: "For Organisations" },
  { href: "/pages/contact-us", label: "Contact" },
];

export function SiteFooter() {
  return (
    <footer className="mt-auto bg-surface-dark text-on-dark">
      <div className="fc-container flex flex-col gap-8 py-12 md:flex-row md:items-center md:justify-between">
        <Link href="/" aria-label={brand.name}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={brand.logoFooter} alt={brand.name} className="h-8 w-auto" />
        </Link>
        <nav className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          {links.map((l) => <Link key={l.label} href={l.href} className="opacity-80 hover:opacity-100">{l.label}</Link>)}
        </nav>
      </div>
      <div className="border-t border-white/10">
        <div className="fc-container flex flex-col gap-2 py-5 text-xs opacity-70 md:flex-row md:justify-between">
          <span>© {new Date().getFullYear()} FinCoursa Academy .</span>
          <span className="flex gap-4">
            <Link href="/pages/privacy-policy">Privacy Policy</Link>
            <Link href="/pages/terms-conditions">Terms &amp; Conditions</Link>
          </span>
        </div>
      </div>
    </footer>
  );
}
