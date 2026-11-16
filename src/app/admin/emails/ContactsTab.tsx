import { createAdminClient } from "@/lib/supabase/admin";
import { formatDate } from "@/lib/format";
import { Card } from "@/components/dash/Stat";
import { importContacts, updateContact } from "./actions";

/** People without a FinCoursa account who agreed to hear from us: import, search, unsubscribe on request. */
export async function ContactsTab({ q }: { q: string }) {
  const db = createAdminClient();
  const search = q.trim().replace(/[%,()]/g, "");
  let list = db.from("email_contacts").select("id, email, first_name, last_name, source, unsubscribed_at, created_at", { count: "exact" })
    .order("created_at", { ascending: false }).limit(100);
  if (search) list = list.or(`email.ilike.%${search}%,first_name.ilike.%${search}%,last_name.ilike.%${search}%`);
  const [{ data: rows, count }, active] = await Promise.all([
    list,
    db.from("email_contacts").select("id", { count: "exact", head: true }).is("unsubscribed_at", null),
  ]);

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
            <label className="grid gap-1 font-medium">Where these contacts came from <span className="font-normal text-muted">(for your records)</span>
              <input name="source" maxLength={80} placeholder="e.g. CMT study group, November" className="fc-input" /></label>
          </div>
          <label className="grid gap-1 font-medium">Or paste addresses
            <textarea name="pasted" rows={4} placeholder={"priya@example.com, Priya, Sharma\ndaniel@example.com"} className="fc-input" /></label>
          <label className="flex items-start gap-2"><input type="checkbox" name="consent" required className="mt-1" />
            <span>These people agreed to receive emails from FinCoursa (for example, they asked for updates or signed up for the free sample). Don&apos;t add bought or scraped lists.</span></label>
          <div><button className="fc-btn fc-btn-primary !min-w-0 !px-5 !py-2.5 text-sm">Add contacts</button></div>
        </form>
      </Card>

      <Card title={`Contact list (${active.count ?? 0} can receive emails)`}>
        <form className="mb-4 flex gap-2">
          <input type="hidden" name="tab" value="contacts" />
          <input name="q" defaultValue={q} placeholder="Search by email or name" className="fc-input max-w-sm" />
          <button className="fc-btn fc-btn-outline !min-w-0 !px-4 !py-2 text-sm text-ink">Search</button>
        </form>
        {!(rows ?? []).length ? <p className="text-sm text-muted">{search ? "No contacts match." : "No contacts yet."}</p> : (
          <>
            <ul className="divide-y divide-line text-sm">
              {(rows ?? []).map((r) => (
                <li key={r.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2.5">
                  <span className="min-w-0">
                    <span className="font-medium">{[r.first_name, r.last_name].filter(Boolean).join(" ") || r.email}</span>
                    {(r.first_name || r.last_name) && <span className="text-muted"> · {r.email}</span>}
                    <span className="block text-xs text-muted">{r.source ?? "Added"} · {formatDate(r.created_at)}{r.unsubscribed_at ? ` · unsubscribed ${formatDate(r.unsubscribed_at)}` : ""}</span>
                  </span>
                  <span className="flex gap-3 text-xs">
                    {!r.unsubscribed_at && <form action={updateContact.bind(null, r.id, "unsubscribe")}><button className="underline">Unsubscribe</button></form>}
                    <form action={updateContact.bind(null, r.id, "delete")}><button className="text-danger underline">Remove</button></form>
                  </span>
                </li>
              ))}
            </ul>
            {(count ?? 0) > 100 && <p className="mt-3 text-xs text-muted">Showing the newest 100 of {count}. Search to find someone.</p>}
          </>
        )}
      </Card>
    </div>
  );
}
