import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatDate } from "@/lib/format";
import { Card } from "@/components/dash/Stat";
import { KIND_LABEL, type Audience, type CampaignKind } from "@/lib/campaigns";
import { Composer } from "./Composer";
import { HistoryActions } from "./HistoryActions";

export const metadata: Metadata = { title: "Emails & updates" };

const STATUS: Record<string, string> = { draft: "Draft", scheduled: "Scheduled", sending: "Sending", sent: "Sent", cancelled: "Stopped" };

export default async function EmailsPage({ searchParams }: PageProps<"/admin/emails">) {
  await requireRole(["admin"], "/admin/emails");
  const from = (await searchParams).from;
  const db = createAdminClient();
  const [{ data: courses }, { data: history }, consenting, { data: reuse }] = await Promise.all([
    db.from("courses").select("id, title").neq("status", "archived").order("sort_order"),
    db.from("email_campaigns").select("id, kind, subject, audience, status, scheduled_for, total, sent, failed, skipped, created_at, finished_at").order("created_at", { ascending: false }).limit(50),
    db.from("profiles").select("id", { count: "exact", head: true }).eq("marketing_opt_in", true),
    typeof from === "string" && /^[0-9a-f-]{36}$/i.test(from)
      ? db.from("email_campaigns").select("kind, subject, heading, body, cta_label, cta_url, audience").eq("id", from).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const title = new Map((courses ?? []).map((c) => [c.id, c.title]));
  const audienceText = (a: Audience) => [
    a.courses?.length ? a.courses.map((c) => title.get(c) ?? "a course").join(", ") : "Everyone",
    a.countries?.length ? a.countries.join(", ") : null,
    a.buyers_only ? "buyers only" : null,
  ].filter(Boolean).join(" · ");
  const draft = reuse ? { ...reuse, kind: (reuse.kind === "update" ? "update" : "promotion") as "promotion" | "update", ...(reuse.audience as Audience) } : undefined;

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-3xl font-bold text-primary">Emails &amp; updates</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted">
          Send weekly updates, new-course news and offers to your students. To tell the students of one course about a change in that course,
          post a course update from the course&apos;s page (Admin → Courses), which also shows inside the course.
        </p>
      </div>

      <section id="compose" className="scroll-mt-24">
        <Card title={draft ? "New email (copied from an earlier one)" : "New email"}>
          <Composer courses={courses ?? []} draft={draft} consenting={consenting.count ?? 0} />
        </Card>
      </section>

      <Card title="Sent and scheduled">
        {!(history ?? []).length ? <p className="text-sm text-muted">Nothing sent yet.</p> : (
          <ul className="divide-y divide-line">
            {(history ?? []).map((c) => (
              <li key={c.id} className="grid gap-2 py-4 md:grid-cols-[1.6fr_1fr_auto] md:items-start">
                <div className="min-w-0">
                  <p className="font-medium text-ink">{c.subject}</p>
                  <p className="text-xs text-muted">{KIND_LABEL[c.kind as CampaignKind]} · {audienceText(c.audience as Audience)}</p>
                </div>
                <div className="text-sm">
                  <span className={c.status === "sent" ? "text-success" : c.status === "cancelled" ? "text-muted" : "text-warning"}>{STATUS[c.status] ?? c.status}</span>
                  <span className="text-muted"> · {c.status === "scheduled" ? `for ${formatDate(c.scheduled_for)}` : formatDate(c.finished_at ?? c.created_at)}</span>
                  {c.status !== "scheduled" && (
                    <p className="text-xs text-muted">{c.sent} of {c.total} sent{c.failed ? ` · ${c.failed} failed` : ""}{c.skipped ? ` · ${c.skipped} not delivered (no email provider)` : ""}</p>
                  )}
                </div>
                <HistoryActions id={c.id} status={c.status} total={c.total} sent={c.sent} failed={c.failed} skipped={c.skipped} />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
