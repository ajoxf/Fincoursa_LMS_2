import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatDate, countryName, daysAgoIso } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { ORG_TYPES, STAGES } from "@/lib/growth";
import { Card } from "@/components/dash/Stat";
import { addLead, approveOutbox, rejectOutbox, runGrowthNow } from "./growth-actions";

const stageLabel = (s: string) => STAGES.find(([v]) => v === s)?.[1] ?? s;
const typeLabel = (t: string) => ORG_TYPES.find(([v]) => v === t)?.[1] ?? t;
const SOURCE: Record<string, string> = { enquiry: "Enquiry", domain: "Spotted from sign-ups", manual: "Added by staff" };
const STAGE_CLS: Record<string, string> = {
  new: "bg-warning/15 text-warning", contacted: "bg-surface", proposal: "bg-accent/30", pilot: "bg-accent/60", won: "bg-success/15 text-success", lost: "bg-surface text-muted",
};
export const StagePill = ({ stage }: { stage: string }) => <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STAGE_CLS[stage] ?? ""}`}>{stageLabel(stage)}</span>;

type Outbox = { id: string; lead_id: string | null; kind: string; to_email: string; to_name: string | null; subject: string; body: string; cta_url: string | null; reason: string | null; created_at: string; lead: { organization: string } | null };

/** One email waiting for approval: edit it, then send or remove. */
export function OutboxItem({ m, back }: { m: Outbox; back: string }) {
  return (
    <form className="grid gap-3 rounded-xl border border-line bg-white p-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p><b>{m.lead?.organization ?? "Email"}</b> <span className="text-muted">· to {m.to_name ? `${m.to_name} <${m.to_email}>` : m.to_email}</span></p>
        <span className="text-xs text-muted">{m.reason} · {formatDate(m.created_at, "datetime")}</span>
      </div>
      <input name="subject" defaultValue={m.subject} aria-label="Subject" className="fc-input font-semibold" />
      <textarea name="body" defaultValue={m.body} rows={Math.min(14, m.body.split("\n").length + 2)} aria-label="Message" className="fc-input leading-relaxed" />
      {m.cta_url && <p className="text-xs text-muted">Adds a &ldquo;View your proposal&rdquo; button: <a href={m.cta_url} target="_blank" rel="noreferrer" className="underline">open the proposal</a></p>}
      <div className="flex flex-wrap items-center gap-3">
        <button formAction={approveOutbox.bind(null, m.id, back)} className="fc-btn fc-btn-primary !min-w-0 !px-4 !py-1.5">Approve and send</button>
        <button formAction={rejectOutbox.bind(null, m.id, back)} formNoValidate className="text-sm text-muted underline">Don&apos;t send</button>
        {m.lead_id && <Link href={`/admin/marketing/leads/${m.lead_id}`} className="ml-auto text-sm underline">Open the lead</Link>}
      </div>
    </form>
  );
}

export async function ApprovalsTab() {
  const db = createAdminClient();
  const [{ data: pending }, { data: attention }] = await Promise.all([
    db.from("outbox").select("id, lead_id, kind, to_email, to_name, subject, body, cta_url, reason, created_at, lead:institution_leads(organization)")
      .eq("status", "pending").order("created_at").limit(50),
    db.from("institution_leads").select("id, organization, source, stage, team_size, notes, updated_at")
      .or("and(source.eq.domain,stage.eq.new),stage.eq.pilot").order("updated_at", { ascending: false }).limit(20),
  ]);
  const list = (pending ?? []) as unknown as Outbox[];
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="grid content-start gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted">{list.length ? `${list.length} email${list.length === 1 ? "" : "s"} waiting. Read, edit if needed, then approve.` : "Nothing waiting. New proposals and follow-ups appear here."}</p>
          <form><button formAction={runGrowthNow} className="text-sm underline">Check for new opportunities now</button></form>
        </div>
        {list.map((m) => <OutboxItem key={m.id} m={m} back="/admin/marketing?tab=approvals" />)}
      </div>
      <aside className="grid content-start gap-3">
        <h2 className="font-semibold">Needs your action</h2>
        {(attention ?? []).length ? (attention ?? []).map((l) => (
          <Link key={l.id} href={`/admin/marketing/leads/${l.id}`} className="grid gap-1 rounded-xl border border-line bg-white p-3 text-sm hover:border-ink">
            <span className="font-semibold">{l.organization}</span>
            <span className="text-muted">{l.stage === "pilot" ? "Pilot requested: set it up and reply." : `${l.team_size} people signed up on their own: find a contact and offer a team licence.`}</span>
          </Link>
        )) : <p className="text-sm text-muted">Nothing right now.</p>}
      </aside>
    </div>
  );
}

export async function InstitutionsTab({ stage }: { stage?: string }) {
  const db = createAdminClient();
  const { data } = await db.from("institution_leads")
    .select("id, organization, org_type, country, contact_name, source, stage, value_minor, currency, seats, updated_at")
    .order("updated_at", { ascending: false }).limit(300);
  const leads = data ?? [];
  const shown = stage ? leads.filter((l) => l.stage === stage) : leads.filter((l) => l.stage !== "lost");
  const sums = STAGES.map(([s, label]) => {
    const ls = leads.filter((l) => l.stage === s);
    const usd = ls.filter((l) => l.currency === "USD").reduce((a, l) => a + Number(l.value_minor ?? 0), 0);
    const inr = ls.filter((l) => l.currency === "INR").reduce((a, l) => a + Number(l.value_minor ?? 0), 0);
    return { s, label, n: ls.length, value: [usd ? formatMoney(usd, "USD") : null, inr ? formatMoney(inr, "INR") : null].filter(Boolean).join(" + ") || "–" };
  });
  return (
    <div className="grid gap-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
        {sums.map((x) => (
          <Link key={x.s} href={`/admin/marketing?tab=institutions&stage=${x.s}`} className={`rounded-xl border bg-white p-3 ${stage === x.s ? "border-ink" : "border-line"}`}>
            <p className="text-xs text-muted">{x.label}</p>
            <p className="text-2xl font-bold tabular-nums">{x.n}</p>
            <p className="truncate text-xs text-muted" title={x.value}>{x.value}</p>
          </Link>
        ))}
      </div>
      <Card title={stage ? `${stageLabel(stage)} (${shown.length})` : `Open opportunities (${shown.length})`} action={stage ? <Link href="/admin/marketing?tab=institutions" className="text-sm underline">Show all</Link> : undefined}>
        {shown.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-muted">
                <tr><th className="py-2 pr-3">Organisation</th><th className="pr-3">Type</th><th className="pr-3">Country</th><th className="pr-3">Contact</th><th className="pr-3">How it came in</th><th className="pr-3">Stage</th><th className="pr-3 text-right">Value</th><th className="pr-3">Updated</th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {shown.map((l) => (
                  <tr key={l.id}>
                    <td className="py-2 pr-3"><Link href={`/admin/marketing/leads/${l.id}`} className="font-semibold underline-offset-2 hover:underline">{l.organization}</Link></td>
                    <td className="pr-3">{typeLabel(l.org_type)}</td>
                    <td className="pr-3">{l.country ? countryName(l.country) : "–"}</td>
                    <td className="pr-3">{l.contact_name ?? <span className="text-warning">Find a contact</span>}</td>
                    <td className="pr-3 text-muted">{SOURCE[l.source] ?? l.source}</td>
                    <td className="pr-3"><StagePill stage={l.stage} /></td>
                    <td className="pr-3 text-right tabular-nums">{l.value_minor ? formatMoney(l.value_minor, l.currency ?? "USD") : "–"}</td>
                    <td className="pr-3 text-muted">{formatDate(l.updated_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="text-sm text-muted">No organisations here yet. Enquiries from the For Institutions page appear here automatically.</p>}
      </Card>
      <Card title="Add an organisation">
        <form action={addLead} className="flex flex-wrap items-end gap-3 text-sm">
          <label className="grid gap-1">Organisation<input name="organization" required className="fc-input w-56" /></label>
          <label className="grid gap-1">Type<select name="org_type" className="fc-input">{ORG_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
          <label className="grid gap-1">Contact name<input name="contact_name" className="fc-input w-44" /></label>
          <label className="grid gap-1">Contact email<input name="email" type="email" className="fc-input w-56" /></label>
          <label className="grid gap-1">Country code<input name="country" maxLength={2} placeholder="US" className="fc-input w-20 uppercase" /></label>
          <label className="grid gap-1">People<input name="team_size" inputMode="numeric" placeholder="10" className="fc-input w-20" /></label>
          <button className="fc-btn fc-btn-dark !min-w-0 !px-4 !py-2">Add</button>
        </form>
      </Card>
    </div>
  );
}

export async function DemandTab() {
  const db = createAdminClient();
  const since = daysAgoIso(30);
  const [{ data: courses }, { data: waits }, { data: leads }] = await Promise.all([
    db.from("courses").select("id, title, status, coming_soon").neq("status", "archived").order("sort_order"),
    db.from("contact_requests").select("course_id, country, created_at").eq("program_type", "waitlist").not("course_id", "is", null),
    db.from("institution_leads").select("course_ids, country, created_at, team_size"),
  ]);
  const rows = (courses ?? []).map((c) => {
    const w = (waits ?? []).filter((x) => x.course_id === c.id);
    const l = (leads ?? []).filter((x) => (x.course_ids ?? []).includes(c.id));
    const countries = new Map<string, number>();
    for (const x of [...w, ...l]) if (x.country) countries.set(x.country, (countries.get(x.country) ?? 0) + 1);
    return {
      ...c, waitlist: w.length, waitlist30: w.filter((x) => x.created_at >= since).length,
      enquiries: l.length, people: l.reduce((a, x) => a + Number(x.team_size ?? 0), 0),
      top: [...countries.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, n]) => `${countryName(k)} ${n}`).join(", "),
    };
  }).sort((a, b) => (b.enquiries * 5 + b.waitlist) - (a.enquiries * 5 + a.waitlist));
  return (
    <div className="grid gap-4">
      <p className="max-w-3xl text-sm text-muted">Interest in each course: people who asked to be told when it launches, and organisations that enquired about it. Use it to decide which course to build and which instructor to recruit next. Institution enquiries count most.</p>
      <div className="overflow-x-auto rounded-xl border border-line bg-white">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-muted">
            <tr><th className="p-3">Course</th><th className="p-3 text-right">Waitlist</th><th className="p-3 text-right">Last 30 days</th><th className="p-3 text-right">Institution enquiries</th><th className="p-3 text-right">People in those teams</th><th className="p-3">Top countries</th></tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="p-3"><span className="font-semibold">{r.title}</span> <span className="text-xs text-muted">{r.status === "draft" ? "· draft" : r.coming_soon ? "· coming soon" : "· live"}</span></td>
                <td className="p-3 text-right tabular-nums">{r.waitlist}</td>
                <td className="p-3 text-right tabular-nums">{r.waitlist30}</td>
                <td className="p-3 text-right tabular-nums">{r.enquiries}</td>
                <td className="p-3 text-right tabular-nums">{r.people || "–"}</td>
                <td className="p-3 text-muted">{r.top || "–"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
