import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatDate } from "@/lib/format";
import { Card } from "@/components/dash/Stat";
import { KIND_LABEL, campaignTag, type Audience, type CampaignKind } from "@/lib/campaigns";
import { LAUNCH_DESIGNS } from "@/lib/email/launch-design";
import { ContactsTab } from "./ContactsTab";
import { Composer } from "./Composer";
import { HistoryActions } from "./HistoryActions";
import { AutomaticEmails, InstitutionEmails } from "./AutomaticEmails";

const TABS = [["send", "Send an email"], ["contacts", "Contacts"], ["automatic", "Automatic emails"], ["institutions", "Institution emails"]] as const;
const TEAM_TABS = ["send", "contacts"];

export const metadata: Metadata = { title: "Emails & updates" };

const STATUS: Record<string, string> = { draft: "Draft", awaiting_approval: "Waiting for approval", scheduled: "Scheduled", sending: "Sending", sent: "Sent", cancelled: "Stopped" };
const DESIGN_LABEL = new Map<string, string>(LAUNCH_DESIGNS.map((d) => [d.id, d.label]));

export default async function EmailsPage({ searchParams }: PageProps<"/admin/emails">) {
  const me = await requireRole(["admin", "support"], "/admin/emails");
  const isAdmin = me.roles.includes("admin");
  const sp = await searchParams;
  const from = sp.from;
  const tabs = TABS.filter(([v]) => isAdmin || TEAM_TABS.includes(v));
  const tab = tabs.some(([v]) => v === sp.tab) ? (sp.tab as string) : "send";
  const db = createAdminClient();
  const [{ data: courses }, { data: history }, consenting, { data: reuse }, contactCount] = await Promise.all([
    db.from("courses").select("id, title").neq("status", "archived").order("sort_order"),
    db.from("email_campaigns").select("id, kind, design, subject, audience, include_contacts, exclude_buyers_of, status, send_mode, scheduled_for, total, sent, failed, skipped, created_at, finished_at, submitted_by, approved_by").order("created_at", { ascending: false }).limit(50),
    db.from("profiles").select("id", { count: "exact", head: true }).eq("marketing_opt_in", true),
    typeof from === "string" && /^[0-9a-f-]{36}$/i.test(from)
      ? db.from("email_campaigns").select("kind, design, subject, heading, body, cta_label, cta_url, audience, include_contacts, exclude_buyers_of").eq("id", from).maybeSingle()
      : Promise.resolve({ data: null }),
    db.from("email_contacts").select("id", { count: "exact", head: true }).is("unsubscribed_at", null),
  ]);
  // clicks per email (links carry ?v=<tag>) and who submitted / approved
  const tags = (history ?? []).map((c) => campaignTag(c.id));
  const { data: clickRows } = tags.length ? await db.from("campaign_clicks").select("variant").in("variant", tags) : { data: [] as { variant: string }[] };
  const clicks = new Map<string, number>();
  for (const r of clickRows ?? []) clicks.set(r.variant, (clicks.get(r.variant) ?? 0) + 1);
  const people = [...new Set((history ?? []).flatMap((c) => [c.submitted_by, c.approved_by]).filter(Boolean) as string[])];
  const { data: staff } = people.length ? await db.from("profiles").select("id, full_name, email").in("id", people) : { data: [] as { id: string; full_name: string | null; email: string }[] };
  const who = new Map((staff ?? []).map((p) => [p.id, p.full_name || p.email]));
  const waiting = (history ?? []).filter((c) => c.status === "awaiting_approval").length;
  const title = new Map((courses ?? []).map((c) => [c.id, c.title]));
  const audienceText = (a: Audience) => [
    a.courses?.length ? a.courses.map((c) => title.get(c) ?? "a course").join(", ") : "Everyone",
    a.countries?.length ? a.countries.join(", ") : null,
    a.buyers_only ? "buyers only" : null,
  ].filter(Boolean).join(" · ");
  const draft = reuse ? { ...reuse, kind: (reuse.kind === "update" ? "update" : "promotion") as "promotion" | "update", ...(reuse.audience as Audience) } : undefined;
  const designs = LAUNCH_DESIGNS.map((d) => ({ id: d.id, label: d.label }));

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-3xl font-bold text-primary">Emails &amp; updates</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted">
          Send weekly updates, new-course news and offers to your students, and set up the emails that go out automatically. To tell the students
          of one course about a change in that course, post a course update from the course&apos;s page (Admin → Courses), which also shows inside the course.
        </p>
      </div>
      <nav className="flex flex-wrap gap-2">
        {tabs.map(([v, l]) => (
          <a key={v} href={`/admin/emails?tab=${v}`} className={`rounded-full px-4 py-1.5 text-sm ${tab === v ? "bg-ink text-white" : "bg-surface"}`}>{l}</a>
        ))}
      </nav>
      {typeof sp.ok === "string" && <p className="rounded-lg bg-success/10 p-3 text-sm text-success">{sp.ok}</p>}
      {typeof sp.err === "string" && <p className="rounded-lg bg-danger/10 p-3 text-sm text-danger">{sp.err}</p>}
      {tab === "contacts" && <ContactsTab q={typeof sp.q === "string" ? sp.q : ""} />}
      {tab === "automatic" && <AutomaticEmails />}
      {tab === "institutions" && <InstitutionEmails />}
      {tab === "send" && <>

      <section id="compose" className="scroll-mt-24">
        <Card title={draft ? "New email (copied from an earlier one)" : "New email"}>
          <Composer courses={courses ?? []} draft={draft} consenting={consenting.count ?? 0} contacts={contactCount.count ?? 0} designs={designs} isAdmin={isAdmin} />
        </Card>
      </section>

      {waiting > 0 && isAdmin && <p className="rounded-lg bg-warning/10 p-3 text-sm text-warning">{waiting} email{waiting === 1 ? " is" : "s are"} waiting for your approval below.</p>}
      <Card title="Sent and scheduled">
        {!(history ?? []).length ? <p className="text-sm text-muted">Nothing sent yet.</p> : (
          <ul className="divide-y divide-line">
            {(history ?? []).map((c) => (
              <li key={c.id} className="grid gap-2 py-4 md:grid-cols-[1.6fr_1fr_auto] md:items-start">
                <div className="min-w-0">
                  <p className="font-medium text-ink">{c.subject}</p>
                  <p className="text-xs text-muted">
                    {DESIGN_LABEL.get(c.design) ?? KIND_LABEL[c.kind as CampaignKind]} · {audienceText(c.audience as Audience)}{c.include_contacts ? " + contact list" : ""}
                    {c.exclude_buyers_of ? ` · leaving out buyers of ${title.get(c.exclude_buyers_of) ?? "a course"}` : ""}
                  </p>
                  {(c.submitted_by || c.approved_by) && (
                    <p className="text-xs text-muted">{c.submitted_by ? `Drafted by ${who.get(c.submitted_by) ?? "the team"}` : ""}{c.submitted_by && c.approved_by ? " · " : ""}{c.approved_by ? `approved by ${who.get(c.approved_by) ?? "an admin"}` : ""}</p>
                  )}
                </div>
                <div className="text-sm">
                  <span className={c.status === "sent" ? "text-success" : c.status === "cancelled" ? "text-muted" : "text-warning"}>{STATUS[c.status] ?? c.status}</span>
                  <span className="text-muted"> · {c.status === "scheduled" || (c.status === "awaiting_approval" && c.send_mode === "schedule") ? `for ${formatDate(c.scheduled_for)}` : c.status === "awaiting_approval" ? "to send when approved" : formatDate(c.finished_at ?? c.created_at)}</span>
                  {c.status !== "scheduled" && c.status !== "awaiting_approval" && (
                    <p className="text-xs text-muted">{c.sent} of {c.total} sent{c.failed ? ` · ${c.failed} failed` : ""}{c.skipped ? ` · ${c.skipped} not delivered (no email provider)` : ""}
                      {c.sent ? ` · ${clicks.get(campaignTag(c.id)) ?? 0} clicks` : ""}</p>
                  )}
                </div>
                <HistoryActions id={c.id} status={c.status} total={c.total} sent={c.sent} failed={c.failed} skipped={c.skipped} isAdmin={isAdmin} />
              </li>
            ))}
          </ul>
        )}
      </Card>
      </>}
    </div>
  );
}
