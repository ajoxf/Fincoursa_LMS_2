import { createAdminClient } from "@/lib/supabase/admin";
import { formatDate } from "@/lib/format";
import { Card } from "@/components/dash/Stat";
import { editContact, importContacts, updateContact } from "./actions";

/** People without a FinCoursa account who agreed to hear from us: import into groups, edit, pick people to email. */
export async function ContactsTab({ q, group }: { q: string; group: string }) {
  const db = createAdminClient();
  const search = q.trim().replace(/[%,()]/g, "");
  let list = db.from("email_contacts").select("id, email, first_name, last_name, source, groups, unsubscribed_at, created_at", { count: "exact" })
    .order("created_at", { ascending: false }).limit(200);
  if (search) list = list.or(`email.ilike.%${search}%,first_name.ilike.%${search}%,last_name.ilike.%${search}%`);
  if (group) list = list.contains("groups", [group]);
  const [{ data: rows, count }, active, { data: all }] = await Promise.all([
    list,
    db.from("email_contacts").select("id", { count: "exact", head: true }).is("unsubscribed_at", null),
    db.from("email_contacts").select("groups").is("unsubscribed_at", null).limit(20000),
  ]);
  // contacts who also have an account where they said no to marketing emails: their account choice wins
  const emails = (rows ?? []).map((r) => r.email.toLowerCase());
  const { data: optedOut } = emails.length ? await db.from("profiles").select("email").in("email", emails).eq("marketing_opt_in", false) : { data: [] as { email: string }[] };
  const noMarketing = new Set((optedOut ?? []).map((p) => String(p.email).toLowerCase()));
  const groupCount = new Map<string, number>();
  for (const r of all ?? []) for (const g of (r.groups ?? []) as string[]) groupCount.set(g, (groupCount.get(g) ?? 0) + 1);
  const groups = [...groupCount].sort((a, b) => a[0].localeCompare(b[0]));
  const chip = (label: string, href: string, on: boolean) => <a key={href} href={href} className={`rounded-full px-3 py-1 text-xs ${on ? "bg-ink text-white" : "bg-surface"}`}>{label}</a>;
  const link = (g: string) => `/admin/emails?tab=contacts${g ? `&group=${encodeURIComponent(g)}` : ""}${q ? `&q=${encodeURIComponent(q)}` : ""}`;

  return (
    <div className="grid gap-6">
      <Card title="Add contacts">
        <form action={importContacts} className="grid gap-4 text-sm">
          <p className="text-muted">
            For people who don&apos;t have a FinCoursa account yet, such as CMT candidates you know. Upload a CSV with the columns
            <b> email, first_name, last_name</b> (a spreadsheet saved as CSV works), or paste one email per line. Anyone already on the list is not added twice,
            and people who unsubscribed stay unsubscribed. Website sign-ups who tick &quot;send me updates&quot; are included automatically, so you don&apos;t need to add them here.
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-1 font-medium">CSV file<input type="file" name="file" accept=".csv,text/csv,.txt" className="fc-input" /></label>
            <label className="grid gap-1 font-medium">Add them to a group <span className="font-normal text-muted">(optional: pick one or type a new name)</span>
              <input name="group" list="contact-groups" maxLength={60} defaultValue={group} placeholder="e.g. CMT Group 1" className="fc-input" />
              <datalist id="contact-groups">{groups.map(([g]) => <option key={g} value={g} />)}</datalist></label>
          </div>
          <label className="grid gap-1 font-medium">Or paste addresses
            <textarea name="pasted" rows={4} placeholder={"priya@example.com, Priya, Sharma\ndaniel@example.com"} className="fc-input" /></label>
          <label className="flex items-start gap-2"><input type="checkbox" name="consent" required className="mt-1" />
            <span>These people agreed to receive emails from FinCoursa (for example, they asked for updates or signed up for the free sample). Don&apos;t add bought or scraped lists.</span></label>
          <div><button className="fc-btn fc-btn-primary !min-w-0 !px-5 !py-2.5 text-sm">Add contacts</button></div>
        </form>
      </Card>

      <Card title={`Contact list (${active.count ?? 0} can receive emails)`}>
        <div className="mb-4 grid gap-3">
          <form className="flex gap-2">
            <input type="hidden" name="tab" value="contacts" />
            {group && <input type="hidden" name="group" value={group} />}
            <input name="q" defaultValue={q} placeholder="Search by email or name" className="fc-input max-w-sm" />
            <button className="fc-btn fc-btn-outline !min-w-0 !px-4 !py-2 text-sm text-ink">Search</button>
          </form>
          {groups.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted">Groups:</span>
              {chip("All contacts", link(""), !group)}
              {groups.map(([g, n]) => chip(`${g} (${n})`, link(g), group === g))}
              {group && <a href={`/admin/emails?tab=send&group=${encodeURIComponent(group)}#compose`} className="ml-auto text-xs font-semibold underline">Email this group</a>}
            </div>
          )}
        </div>
        {/* ticked people are sent to the composer as hand-picked recipients */}
        <form id="pick-form" action="/admin/emails" method="get" className="hidden"><input type="hidden" name="tab" value="send" /></form>
        {!(rows ?? []).length ? <p className="text-sm text-muted">{search || group ? "No contacts match." : "No contacts yet."}</p> : (
          <>
            <ul className="divide-y divide-line text-sm">
              {(rows ?? []).map((r) => (
                <li key={r.id} className="grid gap-2 py-2.5">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <label className="flex min-w-0 items-baseline gap-2">
                      <input type="checkbox" name="pick" value={r.email} form="pick-form" disabled={Boolean(r.unsubscribed_at) || noMarketing.has(r.email.toLowerCase())} />
                      <span className="min-w-0">
                        <span className="font-medium">{[r.first_name, r.last_name].filter(Boolean).join(" ") || r.email}</span>
                        {(r.first_name || r.last_name) && <span className="text-muted"> · {r.email}</span>}
                        <span className="block text-xs text-muted">
                          {(r.groups ?? []).length ? (r.groups as string[]).join(", ") : "No group"} · added {formatDate(r.created_at)}{r.unsubscribed_at ? ` · unsubscribed ${formatDate(r.unsubscribed_at)}` : ""}
                        </span>
                        {noMarketing.has(r.email.toLowerCase()) && !r.unsubscribed_at && (
                          <span className="block text-xs text-warning">Won&apos;t get marketing emails: they have a FinCoursa account and said no to marketing emails there. They can turn it on in their account settings.</span>
                        )}
                      </span>
                    </label>
                    <span className="flex gap-3 text-xs">
                      {!r.unsubscribed_at && <form action={updateContact.bind(null, r.id, "unsubscribe")}><button className="underline">Unsubscribe</button></form>}
                      <form action={updateContact.bind(null, r.id, "delete")}><button className="text-danger underline">Remove</button></form>
                    </span>
                  </div>
                  <details className="pl-6">
                    <summary className="cursor-pointer text-xs underline">Edit</summary>
                    <form action={editContact} className="mt-2 grid gap-2 rounded-lg bg-surface p-3 sm:grid-cols-2">
                      <input type="hidden" name="id" value={r.id} />
                      <label className="grid gap-1 text-xs font-medium">First name<input name="first_name" defaultValue={r.first_name ?? ""} maxLength={80} className="fc-input !py-1.5 text-sm" /></label>
                      <label className="grid gap-1 text-xs font-medium">Last name<input name="last_name" defaultValue={r.last_name ?? ""} maxLength={80} className="fc-input !py-1.5 text-sm" /></label>
                      <label className="grid gap-1 text-xs font-medium">Email<input name="email" type="email" required defaultValue={r.email} className="fc-input !py-1.5 text-sm" /></label>
                      <label className="grid gap-1 text-xs font-medium">Groups <span className="font-normal text-muted">(separate with commas)</span>
                        <input name="groups" list="contact-groups" defaultValue={(r.groups ?? []).join(", ")} className="fc-input !py-1.5 text-sm" /></label>
                      <div><button className="fc-btn fc-btn-primary !min-w-0 !px-4 !py-2 text-sm">Save</button></div>
                    </form>
                  </details>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button form="pick-form" className="fc-btn fc-btn-primary !min-w-0 !px-5 !py-2.5 text-sm">Email selected people</button>
              <span className="text-xs text-muted">Tick people above, then click to write an email to just them.</span>
            </div>
            {(count ?? 0) > 200 && <p className="mt-3 text-xs text-muted">Showing the newest 200 of {count}. Search or pick a group to find someone.</p>}
          </>
        )}
      </Card>
    </div>
  );
}
