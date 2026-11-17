import { Logo } from "@/components/site/Logo";
import Link from "next/link";
import { brand } from "./brand";
import { getListedBundles, getTopics } from "@/lib/catalog";

const links = [
  { href: "/pages/programmes", label: "Programmes" },
  { href: "/pages/paid-courses", label: "Courses" },
  { href: "/pages/instructors", label: "Instructors" },
  { href: "/pages/institutions", label: "For Institutions" },
  { href: "/pages/contact-us", label: "Contact" },
];

export async function SiteFooter() {
  // "Programmes" only appears while at least one programme is published
  const [bundles, topics] = await Promise.all([getListedBundles().catch(() => []), getTopics().catch(() => [])]);
  const base = bundles.length > 0 ? links : links.filter((l) => l.href !== "/pages/programmes");
  // topics sit right after "Courses"
  const shown = [base[0], ...(base[0].href === "/pages/programmes" ? [base[1]] : []), ...topics.map((t) => ({ href: `/topics/${t.slug}`, label: t.name })),
    ...base.slice(base[0].href === "/pages/programmes" ? 2 : 1)];
  return (
    <footer className="mt-auto bg-surface-dark text-white/85">
      <div className="fc-container">
        <div className="flex flex-col gap-8 py-14 md:flex-row md:items-center md:justify-between">
          <Link href="/" aria-label={brand.name}>
            <Logo tone="light" className="h-7" />
          </Link>
          <nav className="flex flex-wrap gap-x-10 gap-y-3 text-[15px]">
            {shown.map((l) => <Link key={l.label} href={l.href} className="hover:text-white">{l.label}</Link>)}
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
