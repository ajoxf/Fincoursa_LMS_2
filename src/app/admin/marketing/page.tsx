import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { AboutTab, AssistantTab, StartTab } from "./Tabs";
import { SettingsTab } from "./SettingsTab";

export const metadata: Metadata = { title: "Marketing" };

const TABS = [
  ["assistant", "Assistant"],
  ["start", "Getting started"],
  ["about", "About FinCoursa"],
  ["settings", "Tracking & emails"],
] as const;
type Tab = (typeof TABS)[number][0];

export default async function AdminMarketing({ searchParams }: PageProps<"/admin/marketing">) {
  await requireRole(["admin"], "/admin/marketing");
  const sp = await searchParams;
  const tab = (TABS.some(([t]) => t === sp.tab) ? sp.tab : "assistant") as Tab;
  const ok = typeof sp.ok === "string" ? sp.ok : null;
  const err = typeof sp.err === "string" ? sp.err : null;

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-3xl font-bold text-primary">Marketing</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted">
          Your marketing assistant writes LinkedIn posts, ads and emails for FinCoursa, and tells you exactly how to use them.
          New to LinkedIn? Start with <Link href="/admin/marketing?tab=start" className="underline">Getting started</Link>.
        </p>
      </div>
      <nav className="flex flex-wrap gap-1 border-b border-line" aria-label="Marketing sections">
        {TABS.map(([t, label]) => (
          <Link key={t} href={`/admin/marketing?tab=${t}`} aria-current={t === tab ? "page" : undefined}
            className={`-mb-px rounded-t-lg border px-4 py-2 text-sm ${t === tab ? "border-line border-b-white bg-white font-semibold" : "border-transparent text-muted hover:text-ink"}`}>
            {label}
          </Link>
        ))}
      </nav>
      {ok && <p className="rounded-lg bg-success/10 p-3 text-sm text-success">{ok}</p>}
      {err && <p className="rounded-lg bg-danger/10 p-3 text-sm text-danger">{err}</p>}

      {tab === "assistant" && <AssistantTab />}
      {tab === "start" && <StartTab />}
      {tab === "about" && <AboutTab />}
      {tab === "settings" && <SettingsTab />}
    </div>
  );
}

