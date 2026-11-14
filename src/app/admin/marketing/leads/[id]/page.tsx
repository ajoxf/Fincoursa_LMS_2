import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatDate, countryName } from "@/lib/format";
import { formatMoney, minorUnitsFactor } from "@/lib/money";
import { ORG_TYPES, proposalUrl, STAGES } from "@/lib/growth";
import { Card } from "@/components/dash/Stat";
import { OutboxItem, StagePill } from "../../GrowthTabs";
import { addLeadNote, updateLead, writeLeadEmail } from "../../growth-actions";

export const metadata: Metadata = { title: "Lead" };

const EVENT: Record<string, string> = { created: "Created", email: "Email", note: "Note", stage: "Stage", skipped: "Not sent", pilot_requested: "Pilot requested", accepted: "Accepted" };

export default async function LeadPage({ params, searchParams }: PageProps<"/admin/marketing/leads/[id]">) {
  await requireRole(["admin", "support", "finance"], "/admin/marketing");
  const { id } = await params;
  const sp = await searchParams;
  const db = createAdminClient();
  const [{ data: l }, { data: events }, { data: pending }] = await Promise.all([
    db.from("institution_leads").select("*").eq("id", id).maybeSingle(),
    db.from("lead_events").select("id, kind, body, created_at").eq("lead_id", id).order("created_at", { ascending: false }).limit(100),
    db.from("outbox").select("id, lead_id, kind, to_email, to_name, subject, body, cta_url, reason, created_at, lead:institution_leads(organization)").eq("lead_id", id).eq("status", "pending"),
  ]);
  if (!l) notFound();
  const { data: courses } = l.course_ids?.length ? await db.from("courses").select("id, title").in("id", l.course_ids) : { data: [] };
  const back = `/admin/marketing/leads/${id}`;
  const cur = l.currency ?? "USD";
  const field = "fc-input !py-1.5";

  return (
    <div className="grid gap-6">
      <div className="grid gap-2">
        <Link href="/admin/marketing?tab=institutions" className="text-sm underline">← Institutions</Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-bold text-primary">{l.organization}</h1>
          <StagePill stage={l.stage} />
        </div>
        <p className="text-sm text-muted">
          {ORG_TYPES.find(([v]) => v === l.org_type)?.[1]}{l.country ? ` · ${countryName(l.country)}` : ""} · {l.source === "domain" ? "Spotted from sign-ups" : l.source === "manual" ? "Added by staff" : "Enquiry"} · {formatDate(l.created_at)}
          {l.value_minor ? ` · ${formatMoney(l.value_minor, cur)}` : ""}
        </p>
      </div>
      {typeof sp.ok === "string" && <p className="rounded-lg bg-success/10 p-3 text-sm text-success">{sp.ok}</p>}
      {typeof sp.err === "string" && <p className="rounded-lg bg-danger/10 p-3 text-sm text-danger">{sp.err}</p>}

      {(pending ?? []).length > 0 && (
        <div className="grid gap-3">
          <h2 className="font-semibold">Waiting for your approval</h2>
          {(pending ?? []).map((m) => <OutboxItem key={m.id} m={m as never} back={back} />)}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="grid content-start gap-6">
          <Card title="Details and quote">
            <form action={updateLead.bind(null, id)} className="grid gap-4 text-sm">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1">Organisation<input name="organization" defaultValue={l.organization} className={field} /></label>
                <label className="grid gap-1">Type<select name="org_type" defaultValue={l.org_type} className={field}>{ORG_TYPES.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></label>
                <label className="grid gap-1">Contact name<input name="contact_name" defaultValue={l.contact_name ?? ""} className={field} /></label>
                <label className="grid gap-1">Contact email<input name="email" type="email" defaultValue={l.email ?? ""} className={field} /></label>
                <label className="grid gap-1">Role<input name="role" defaultValue={l.role ?? ""} className={field} /></label>
                <label className="grid gap-1">Country code<input name="country" maxLength={2} defaultValue={l.country ?? ""} className={`${field} uppercase`} /></label>
                <label className="grid gap-1">Stage<select name="stage" defaultValue={l.stage} className={field}>{STAGES.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></label>
              </div>
              <fieldset className="grid gap-2 rounded-lg border border-line p-3">
                <legend className="px-1 font-medium">Quote ({cur})</legend>
                <div className="flex flex-wrap gap-3">
                  <label className="flex items-center gap-2">People<input name="seats" defaultValue={l.seats ?? ""} inputMode="numeric" className={`${field} w-20`} /></label>
                  <label className="flex items-center gap-2">Price per person, per course<input name="seat_price" defaultValue={l.seat_price_minor ? Number(l.seat_price_minor) / minorUnitsFactor(cur) : ""} inputMode="decimal" className={`${field} w-24`} /></label>
                  <label className="flex items-center gap-2">Discount %<input name="discount_pct" defaultValue={l.discount_pct ?? ""} inputMode="decimal" className={`${field} w-16`} /></label>
                </div>
                <p className="text-xs text-muted">Courses: {courses?.length ? courses.map((c) => c.title).join(", ") : "not chosen (priced as one course)"}. Total now: {l.value_minor ? formatMoney(l.value_minor, cur) : "–"}. The proposal page updates as soon as you save.</p>
              </fieldset>
              <label className="grid gap-1">Notes<textarea name="notes" rows={4} defaultValue={l.notes ?? ""} className="fc-input" /></label>
              <button className="fc-btn fc-btn-dark justify-self-start !min-w-0 !px-5 !py-2">Save</button>
            </form>
          </Card>

          <Card title="Write an email">
            {l.email ? (
              <form action={writeLeadEmail.bind(null, id)} className="grid gap-3 text-sm">
                <input name="subject" placeholder="Subject" required className="fc-input" />
                <textarea name="body" rows={6} required placeholder={`Hi ${l.contact_name?.split(" ")[0] ?? "there"},\n\n`} className="fc-input" />
                <div className="flex flex-wrap gap-4">
                  <label className="flex items-center gap-2"><input type="checkbox" name="with_proposal" defaultChecked /> Add the &ldquo;View your proposal&rdquo; button</label>
                  <label className="flex items-center gap-2"><input type="checkbox" name="send_now" /> Send now (otherwise it waits in Approvals)</label>
                </div>
                <button className="fc-btn fc-btn-dark justify-self-start !min-w-0 !px-5 !py-2">Save email</button>
              </form>
            ) : <p className="text-sm text-muted">Add the contact&apos;s email above to write to them.</p>}
          </Card>
        </div>

        <aside className="grid content-start gap-6">
          {l.proposal_token && (
            <Card title="Proposal page">
              <p className="break-all text-sm"><a href={proposalUrl(l.proposal_token)} target="_blank" rel="noreferrer" className="underline">{proposalUrl(l.proposal_token)}</a></p>
              <p className="mt-2 text-xs text-muted">{l.proposal_sent_at ? `Sent ${formatDate(l.proposal_sent_at)}.` : "Not sent yet."} The lead can request the pilot or accept from this page; you get an email when they do.</p>
            </Card>
          )}
          {l.message && <Card title="Their message"><p className="whitespace-pre-line text-sm">{l.message}</p></Card>}
          <Card title="Timeline">
            <form action={addLeadNote.bind(null, id)} className="mb-4 grid gap-2">
              <textarea name="note" rows={2} placeholder="Add a note (call summary, next step…)" className="fc-input text-sm" />
              <button className="justify-self-start text-sm underline">Add note</button>
            </form>
            <ol className="grid gap-3 text-sm">
              {(events ?? []).map((e) => (
                <li key={e.id} className="grid gap-0.5 border-l-2 border-line pl-3">
                  <span className="text-xs text-muted">{EVENT[e.kind] ?? e.kind} · {formatDate(e.created_at, "datetime")}</span>
                  <span className="whitespace-pre-line">{e.body}</span>
                </li>
              ))}
            </ol>
          </Card>
        </aside>
      </div>
    </div>
  );
}
