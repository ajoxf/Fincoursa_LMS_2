import { getSessionUser } from "@/lib/auth";
import { getBundles, getTopics } from "@/lib/catalog";
import { HeaderBar } from "./HeaderBar";

// The Learn menu: one link per topic (course category with published courses), then all courses.
const programmesLink = { href: "/pages/programmes", label: "Programmes" };
const allCoursesLink = { href: "/pages/paid-courses", label: "All courses" };

export const mainLinks = [
  { href: "/pages/instructors", label: "Instructors" },
  { href: "/pages/institutions", label: "For Institutions" },
  { href: "/pages/contact-us", label: "Contact" },
];

export async function SiteHeader() {
  const [user, bundles, topics] = await Promise.all([getSessionUser(), getBundles().catch(() => []), getTopics().catch(() => [])]);
  // "Programmes" only appears while at least one programme is published
  const learn = [
    ...topics.map((t) => ({ href: `/topics/${t.slug}`, label: t.name })),
    ...(bundles.length ? [programmesLink] : []),
    { href: "/cmt", label: "CMT Prep" },
    allCoursesLink,
  ];
  const name = user ? (user.fullName?.trim() || user.email?.split("@")[0] || "Account") : null;
  return (
    <HeaderBar
      learnLinks={learn}
      mainLinks={mainLinks}
      user={name ? { name, isAdmin: user!.roles.includes("admin"), isInstructor: user!.roles.includes("instructor"), isPartner: user!.roles.includes("affiliate") } : null}
    />
  );
}
