import Link from "next/link";
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
      { href: "/admin/leads", label: "Leads" },
    ] });
  }
  return groups;
}

export async function DashShell({ children }: { children: React.ReactNode }) {
  const user = await requireUser("/dashboard");
  return (
    <>
      <SiteHeader />
      <div className="fc-container grid flex-1 gap-8 py-8 lg:grid-cols-[220px_1fr]">
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <p className="truncate text-sm font-semibold">{user.fullName || user.email}</p>
          <nav className="mt-4 flex gap-6 overflow-x-auto text-sm lg:flex-col lg:gap-5 lg:overflow-visible">
            {navFor(user).map((g) => (
              <div key={g.title} className="shrink-0">
                <p className="mb-1 text-xs uppercase tracking-wide text-muted">{g.title}</p>
                <div className="flex gap-3 lg:flex-col lg:gap-1">
                  {g.items.map((i) => <Link key={i.href} href={i.href} className="whitespace-nowrap rounded-md py-1 hover:text-accent lg:px-2 lg:hover:bg-surface">{i.label}</Link>)}
                </div>
              </div>
            ))}
            <form action="/auth/sign-out" method="post"><button className="text-muted hover:underline lg:px-2">Sign out</button></form>
          </nav>
        </aside>
        <div className="min-w-0">{children}</div>
      </div>
    </>
  );
}
