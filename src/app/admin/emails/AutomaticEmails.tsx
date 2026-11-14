import { createAdminClient } from "@/lib/supabase/admin";
import { formatDate } from "@/lib/format";
import { getAutomations, type EmailCopy } from "@/lib/automations";
import { getGrowthSettings } from "@/lib/growth";
import { Card } from "@/components/dash/Stat";
import { runAutomationsNow, saveAutomations, sendAutomationTest } from "../marketing/actions";
import { saveInstitutionEmails } from "../marketing/growth-actions";

const LABEL: Record<string, string> = {
  auto_abandoned: "Checkout reminder", auto_offer: "Offer closing", auto_welcome_1: "Welcome 1", auto_welcome_2: "Welcome 2",
  auto_welcome_3: "Welcome 3", auto_test: "Test",
};

function CopyFields({ p, c, rows = 7 }: { p: string; c: EmailCopy; rows?: number }) {
  return (
    <div className="grid gap-2">
      <label className="grid gap-1">Subject<input name={`${p}_subject`} defaultValue={c.subject} className="fc-input" /></label>
      <label className="grid gap-1">Message<textarea name={`${p}_body`} defaultValue={c.body} rows={rows} className="fc-input font-mono text-[13px] leading-relaxed" /></label>
      <label className="grid gap-1 sm:w-72">Button text<input name={`${p}_cta`} defaultValue={c.cta} className="fc-input" /></label>
    </div>
  );
}

const TestButton = ({ kind }: { kind: string }) => (
  <button formAction={sendAutomationTest.bind(null, kind)} formNoValidate className="text-xs underline">Send me a test</button>
);

/** Admin → Emails & updates → Automatic emails: checkout reminder, offer closing and welcome sequence. */
export async function AutomaticEmails() {
  const db = createAdminClient();
  const [a, { data: courses }, { data: log }, { count: optedIn }] = await Promise.all([
    getAutomations(),
    db.from("courses").select("id, title").eq("status", "published").order("title"),
    db.from("email_log").select("template, to_email, status, created_at").like("template", "auto_%").order("created_at", { ascending: false }).limit(30),
    db.from("profiles").select("id", { count: "exact", head: true }).eq("marketing_opt_in", true),
  ]);
  const steps = [...a.welcome.steps, ...Array(Math.max(0, 3 - a.welcome.steps.length)).fill(null)].slice(0, 3);

  return (
    <div className="grid gap-6">
      <form action={saveAutomations} className="grid gap-6 text-sm">
        <Card title="Automatic emails">
          <div className="grid gap-3">
            <p className="text-muted">
              Placeholders: <code>{"{first_name}"}</code> <code>{"{course}"}</code> <code>{"{course_link}"}</code> <code>{"{deadline}"}</code>{" "}
              <code>{"{days_left}"}</code> <code>{"{offer_lines}"}</code>. <code>{"{offer_lines}"}</code> lists the offers that are live right now
              (cashback, founding members), so emails never promise something that is switched off. Start a line with &ldquo;- &rdquo; for a bullet.
              Offer and welcome emails go only to people who agreed to marketing emails ({optedIn ?? 0} now), with an unsubscribe link.
            </p>
            <label className="grid gap-1 sm:w-96">Course these emails promote
              <select name="course_id" defaultValue={a.course_id ?? ""} className="fc-input">
                <option value="">Choose a course</option>
                {(courses ?? []).map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
              </select>
            </label>
          </div>
        </Card>

        <Card title="1. Checkout reminder (abandoned checkout)">
          <div className="grid gap-3">
            <label className="flex items-center gap-2 font-medium"><input type="checkbox" name="abandoned_enabled" defaultChecked={a.abandoned.enabled} /> On</label>
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2">Send <input name="abandoned_after_hours" defaultValue={a.abandoned.after_hours} inputMode="numeric" className="fc-input w-20 !py-1.5" /> hours after someone starts checkout without paying</label>
              <label className="flex items-center gap-2"><input type="checkbox" name="abandoned_opted_in_only" defaultChecked={a.abandoned.opted_in_only} /> Only to people who agreed to marketing emails</label>
            </div>
            <p className="text-xs text-muted">One reminder per person per course. Not sent if they have bought or enrolled since. Emails go out once a day, so the delay is at least the hours above.</p>
            <CopyFields p="abandoned" c={a.abandoned} />
            <TestButton kind="abandoned" />
          </div>
        </Card>

        <Card title="2. Offer closing reminders (cart close)">
          <div className="grid gap-3">
            <label className="flex items-center gap-2 font-medium"><input type="checkbox" name="offer_enabled" defaultChecked={a.offer.enabled} /> On</label>
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2">Offer ends on <input type="date" name="offer_deadline" defaultValue={a.offer.deadline?.slice(0, 10) ?? ""} className="fc-input !py-1.5" /></label>
              <label className="flex items-center gap-2">Send <input name="offer_days_before" defaultValue={a.offer.days_before.join(", ")} className="fc-input w-24 !py-1.5" /> days before it ends</label>
            </div>
            <p className="text-xs text-muted">To people who agreed to marketing emails and don&apos;t own the course yet. E.g. &ldquo;3, 1&rdquo; sends one email 3 days before and one the day before.</p>
            <CopyFields p="offer" c={a.offer} />
            <TestButton kind="offer" />
          </div>
        </Card>

        <Card title="3. Welcome sequence (follow-up after sign-up)">
          <div className="grid gap-4">
            <label className="flex items-center gap-2 font-medium"><input type="checkbox" name="welcome_enabled" defaultChecked={a.welcome.enabled} /> On</label>
            <p className="text-xs text-muted">To new sign-ups who agreed to marketing emails, until they buy something. Leave the days empty to skip a step.</p>
            {steps.map((st, k) => (
              <div key={k} className="grid gap-2 rounded-lg border border-line p-4">
                <label className="flex items-center gap-2 font-medium">Email {k + 1}: send <input name={`w${k}_days`} defaultValue={st?.days ?? ""} inputMode="numeric" className="fc-input w-16 !py-1.5" /> days after sign-up</label>
                <CopyFields p={`w${k}`} c={st ?? { subject: "", body: "", cta: "" }} rows={6} />
                {st && <TestButton kind={`welcome_${k}`} />}
              </div>
            ))}
          </div>
        </Card>

        <div className="flex flex-wrap items-center gap-4">
          <button className="fc-btn fc-btn-dark !min-w-0 !px-5 !py-2">Save automatic emails</button>
          <button formAction={runAutomationsNow} formNoValidate className="text-sm underline">Run now (instead of waiting for tomorrow morning)</button>
        </div>
      </form>

      <Card title="Recently sent automatic emails">
        {log?.length ? (
          <ul className="divide-y divide-line text-sm">
            {log.map((l, i) => (
              <li key={i} className="flex flex-wrap justify-between gap-2 py-2">
                <span>{LABEL[l.template] ?? l.template} · {l.to_email}</span>
                <span className="text-muted">{l.status} · {formatDate(l.created_at, "datetime")}</span>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-muted">None yet.</p>}
      </Card>
    </div>
  );
}

/** Admin → Emails & updates → Institution emails: thank-you, proposal and follow-ups for institution enquiries. */
export async function InstitutionEmails() {
  const g = await getGrowthSettings();
  return (
    <Card title="Institution emails">
      <form action={saveInstitutionEmails} className="grid gap-4 text-sm">
        <p className="text-muted">For every enquiry from the For Institutions page. The thank-you goes straight away; the proposal and follow-ups wait in
          Marketing → Approvals until someone approves them. Pricing and the free pilot are set in Marketing → Settings.</p>
          <div className="grid gap-2">
            <p className="text-xs text-muted">Placeholders: {"{first_name}"} {"{organization}"} {"{pilot_seats}"} {"{pilot_days}"} {"{booking_line}"} {"{institutions_link}"}. Lines starting with &ldquo;- &rdquo; become bullets. The proposal and follow-ups get a &ldquo;View your proposal&rdquo; button.</p>
            {([["ack", "Thank-you (sent straight away)", g.ack], ["proposal", "Proposal (waits for approval)", g.proposal],
              ...g.follow_ups.map((f, i) => [`fu${i}`, `Follow-up ${i + 1}`, f] as const)] as const).map(([p, label, c]) => (
              <div key={p} className="mt-4 grid gap-2">
                <p className="font-medium">{label}{p.startsWith("fu") && <> · <input name={`${p}_days`} defaultValue={(c as { days?: number }).days} inputMode="numeric" className="fc-input inline w-14 !py-1" /> days after the proposal</>}</p>
                <input name={`${p}_subject`} defaultValue={c.subject} className="fc-input" aria-label={`${label} subject`} />
                <textarea name={`${p}_body`} defaultValue={c.body} rows={6} className="fc-input font-mono text-[13px]" aria-label={`${label} message`} />
              </div>
            ))}
          </div>
        <button className="fc-btn fc-btn-dark justify-self-start !min-w-0 !px-5 !py-2">Save institution emails</button>
      </form>
    </Card>
  );
}
