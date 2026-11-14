import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { ApprovalsTab, DemandTab, InstitutionsTab } from "./GrowthTabs";
import { SettingsTab } from "./SettingsTab";
import { CampaignsTab, OverviewTab } from "./CampaignTabs";

export const metadata: Metadata = { title: "Marketing" };

const TABS = [["overview", "Overview"], ["campaigns", "Campaigns"], ["approvals", "Approvals"], ["institutions", "Institutions"], ["demand", "Demand"], ["settings", "Settings"]] as const;

export default async function AdminMarketing({ searchParams }: PageProps<"/admin/marketing">) {
  await requireRole(["admin", "support", "finance"], "/admin/marketing");
  const sp = await searchParams;
  const tab = TABS.some(([t]) => t === sp.tab) ? (sp.tab as string) : "overview";
  const ok = typeof sp.ok === "string" ? sp.ok : null;
  const err = typeof sp.err === "string" ? sp.err : null;
  const { count } = await createAdminClient().from("outbox").select("id", { count: "exact", head: true }).eq("status", "pending");

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-3xl font-bold text-primary">Marketing</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted">
          Plan and run campaigns through one process, see what each one brings in (CAC, LTV, revenue), and handle institution
          enquiries. Proposals and follow-ups wait in Approvals; nothing but the instant thank-you is sent without you.
        </p>
      </div>
      <nav className="flex flex-wrap gap-1 border-b border-line" aria-label="Marketing sections">
        {TABS.map(([t, label]) => (
          <Link key={t} href={`/admin/marketing?tab=${t}`} aria-current={t === tab ? "page" : undefined}
            className={`-mb-px rounded-t-lg border px-4 py-2 text-sm ${t === tab ? "border-line border-b-white bg-white font-semibold" : "border-transparent text-muted hover:text-ink"}`}>
            {label}{t === "approvals" && count ? <span className="ml-2 rounded-full bg-warning/20 px-1.5 text-xs font-semibold text-warning">{count}</span> : null}
          </Link>
        ))}
      </nav>
      {ok && <p className="rounded-lg bg-success/10 p-3 text-sm text-success">{ok}</p>}
      {err && <p className="rounded-lg bg-danger/10 p-3 text-sm text-danger">{err}</p>}
      {tab === "overview" && <OverviewTab period={typeof sp.p === "string" ? sp.p : "90"} />}
      {tab === "campaigns" && <CampaignsTab />}
      {tab === "approvals" && <ApprovalsTab />}
      {tab === "institutions" && <InstitutionsTab stage={typeof sp.stage === "string" ? sp.stage : undefined} />}
      {tab === "demand" && <DemandTab />}
      {tab === "settings" && <SettingsTab />}
    </div>
  );
}
