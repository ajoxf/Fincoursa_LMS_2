import { DashNav } from "./DashNav";
import { requireUser, type SessionUser } from "@/lib/auth";
import { SiteHeader } from "@/components/site/SiteHeader";

type NavItem = { href: string; label: string };

function navFor(u: SessionUser): { title: string; items: NavItem[] }[] {
  const groups = [{ title: "Learning", items: [
    { href: "/dashboard", label: "My courses" },
    { href: "/dashboard/purchases", label: "Purchases" },
    { href: "/dashboard/certificates", label: "Certificates" },
    { href: "/dashboard/settings", label: "Settings" },
  ] }];
  if (u.roles.includes("instructor")) groups.push({ title: "Teaching", items: [{ href: "/instructor", label: "Instructor dashboard" }] });
  groups.push({ title: "Partners", items: [{ href: "/affiliate", label: u.roles.includes("affiliate") ? "Affiliate dashboard" : "Become an affiliate" }] });
  if (u.roles.some((r) => ["admin", "finance", "support"].includes(r))) {
    groups.push({ title: "Admin", items: [
      { href: "/admin", label: "Overview" },
      { href: "/admin/orders", label: "Orders & refunds" },
      { href: "/admin/courses", label: "Courses" },
      { href: "/admin/bundles", label: "Bundles" },
      { href: "/admin/instructors", label: "Instructors" },
      { href: "/admin/affiliates", label: "Affiliates" },
      { href: "/admin/payouts", label: "Payouts" },
      { href: "/admin/taxes", label: "Taxes" },
      { href: "/admin/payments", label: "Payment gateways" },
      { href: "/admin/site", label: "Home page & logos" },
      { href: "/admin/leads", label: "Leads" },
      { href: "/admin/import", label: "Import from Thinkific" },
    ] });
  }
  return groups;
}

export async function DashShell({ children }: { children: React.ReactNode }) {
  const user = await requireUser("/dashboard");
  return (
    <>
      <SiteHeader />
      <div className="fc-container grid flex-1 content-start gap-6 py-6 lg:grid-cols-[220px_1fr] lg:gap-8 lg:py-8">
        <aside className="min-w-0 lg:sticky lg:top-24 lg:self-start">
          <DashNav name={user.fullName || user.email || "My account"} groups={navFor(user)} />
        </aside>
        <div className="min-w-0">{children}</div>
      </div>
    </>
  );
}
