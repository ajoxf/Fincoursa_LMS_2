import { Logo } from "@/components/site/Logo";
import Link from "next/link";
import { brand } from "./brand";

const links = [
  { href: "/pages/programmes", label: "Programmes" },
  { href: "/pages/paid-courses", label: "Courses" },
  { href: "/pages/live-courses", label: "Live Courses" },
  { href: "/pages/free-courses", label: "Free Courses" },
  { href: "/pages/instructors", label: "Instructors" },
  { href: "/#org-section", label: "For Organisations" },
  { href: "/pages/contact-us", label: "Contact" },
];

export function SiteFooter() {
  return (
    <footer className="mt-auto bg-surface-dark text-white/85">
      <div className="fc-container">
        <div className="flex flex-col gap-8 py-14 md:flex-row md:items-center md:justify-between">
          <Link href="/" aria-label={brand.name}>
            <Logo tone="light" className="h-7" />
          </Link>
          <nav className="flex flex-wrap gap-x-10 gap-y-3 text-[15px]">
            {links.map((l) => <Link key={l.label} href={l.href} className="hover:text-white">{l.label}</Link>)}
          </nav>
        </div>
        <div className="border-t border-white/20 py-6 text-[15px]">
          © {new Date().getFullYear()} FinCoursa Academy .{" "}
          <Link href="/pages/privacy-policy" className="hover:text-white">Privacy Policy</Link> |{" "}
          <Link href="/pages/terms-conditions" className="hover:text-white">Terms &amp; Conditions</Link>
        </div>
      </div>
    </footer>
  );
}
