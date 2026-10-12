import { getSessionUser } from "@/lib/auth";
import { HeaderBar } from "./HeaderBar";

export const learnLinks = [
  { href: "/pages/programmes", label: "Programmes" },
  { href: "/pages/live-courses", label: "Live Courses" },
  { href: "/pages/free-courses", label: "Free Courses" },
  { href: "/pages/paid-courses", label: "Paid Courses" },
];

export const mainLinks = [
  { href: "/pages/instructors", label: "Instructors" },
  { href: "/#org-section", label: "For Organizations" },
  { href: "/pages/contact-us", label: "Contact" },
];

export async function SiteHeader() {
  const user = await getSessionUser();
  const name = user ? (user.fullName?.trim() || user.email?.split("@")[0] || "Account") : null;
  return (
    <HeaderBar
      learnLinks={learnLinks}
      mainLinks={mainLinks}
      user={name ? { name, isAdmin: user!.roles.includes("admin"), isInstructor: user!.roles.includes("instructor"), isPartner: user!.roles.includes("affiliate") } : null}
    />
  );
}
