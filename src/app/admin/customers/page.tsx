import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatMoney } from "@/lib/money";
import { ALL_COUNTRIES, countryName, daysAgoIso, formatDate } from "@/lib/format";
import { filtersToQuery, parseStudentFilters, searchStudents, spendFor } from "@/lib/students";
import { Stat } from "@/components/dash/Stat";

export const metadata: Metadata = { title: "Customers" };
const PER_PAGE = 50;

const spendText = (m?: Record<string, number>) =>
  m && Object.keys(m).length ? Object.entries(m).filter(([, v]) => v > 0).map(([c, v]) => formatMoney(v, c)).join(" · ") || "—" : "—";

export default async function CustomersPage({ searchParams }: PageProps<"/admin/customers">) {
  await requireRole(["admin", "finance", "support"], "/admin/customers");
  const f = parseStudentFilters(await searchParams);
  const db = createAdminClient();
  const since = daysAgoIso(30);
  const [{ rows, total }, { data: courses }, all, consenting, active] = await Promise.all([
    searchStudents(f, PER_PAGE, (f.page - 1) * PER_PAGE),
    db.from("courses").select("id, title").neq("status", "archived").order("sort_order"),
    db.from("profiles").select("id", { count: "exact", head: true }),
    db.from("profiles").select("id", { count: "exact", head: true }).eq("marketing_opt_in", true),
    db.from("admin_students").select("id", { count: "exact", head: true }).gte("last_activity_at", since),
  ]);
  const spend = await spendFor(rows.map((r) => r.id));
  const pages = Math.max(1, Math.ceil(total / PER_PAGE));
  const filtered = Boolean(f.q || f.course || f.country || f.consent);
  const exportHref = `/api/admin/customers-export?${filtersToQuery({ q: f.q, course: f.course, country: f.country, consent: f.consent, sort: f.sort })}`;

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-bold text-primary">Customers</h1>
        <a href={exportHref} className="fc-btn fc-btn-outline !min-w-0 !px-4 !py-2 text-sm text-ink">Export CSV{filtered ? " (filtered)" : ""}</a>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <Stat label="All accounts" value={all.count ?? 0} />
        <Stat label="Agreed to marketing emails" value={consenting.count ?? 0} hint="Who promotions can be sent to" />
        <Stat label="Studied in the last 30 days" value={active.count ?? 0} hint="Customers with lesson activity" />
      </div>

      <form className="fc-card grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-[2fr_1.5fr_1fr_1fr_1fr_auto] lg:items-end">
        <label className="grid gap-1 text-xs font-medium text-muted">Search
          <input name="q" defaultValue={f.q} placeholder="Name or email" className="fc-input text-sm text-ink" />
        </label>
        <label className="grid gap-1 text-xs font-medium text-muted">Enrolled in
          <select name="course" defaultValue={f.course} className="fc-input text-sm text-ink">
            <option value="">Any course</option>
            {(courses ?? []).map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-xs font-medium text-muted">Country
          <select name="country" defaultValue={f.country} className="fc-input text-sm text-ink">
            <option value="">Any</option>
            {ALL_COUNTRIES.map(([c, n]) => <option key={c} value={c}>{n}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-xs font-medium text-muted">Marketing emails
          <select name="consent" defaultValue={f.consent} className="fc-input text-sm text-ink">
            <option value="">Anyone</option><option value="yes">Agreed</option><option value="no">Not agreed</option>
          </select>
        </label>
        <label className="grid gap-1 text-xs font-medium text-muted">Sort
          <select name="sort" defaultValue={f.sort} className="fc-input text-sm text-ink">
            <option value="new">Newest first</option><option value="active">Recently active</option><option value="name">Name A–Z</option>
          </select>
        </label>
        <div className="flex gap-3">
          <button className="fc-btn fc-btn-primary !min-w-0 !px-5 !py-2.5 text-sm">Filter</button>
          {filtered && <Link href="/admin/customers" className="self-center text-sm underline">Clear</Link>}
        </div>
      </form>

      <p className="-mb-3 text-sm text-muted">{total} {total === 1 ? "person" : "people"}{filtered ? " match" : ""}</p>

      {/* phones: one card per customer */}
      <ul className="grid gap-3 md:hidden">
        {rows.map((s) => (
          <li key={s.id}>
            <Link href={`/admin/customers/${s.id}`} className="fc-card block p-4">
              <p className="font-semibold text-ink">{s.full_name || s.email}</p>
              <p className="text-sm text-muted">{s.email}</p>
              <p className="mt-2 text-sm">{s.active_courses} courses · {spendText(spend.get(s.id))}{s.country_code ? ` · ${s.country_code}` : ""}</p>
              <p className="mt-1 text-xs text-muted">Joined {formatDate(s.created_at)}{s.last_activity_at ? ` · active ${formatDate(s.last_activity_at)}` : ""}{s.marketing_opt_in ? " · ✓ marketing" : ""}</p>
            </Link>
          </li>
        ))}
      </ul>

      {/* larger screens: table */}
      <div className="fc-card hidden overflow-x-auto md:block">
        <table className="w-full min-w-[860px] text-sm">
          <thead className="text-left text-muted"><tr>
            {["Customer", "Country", "Courses", "Spent", "Last active", "Joined", "Marketing"].map((h) => <th key={h} className="p-3 font-medium">{h}</th>)}
          </tr></thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.id} className="border-t border-line align-top hover:bg-surface/60">
                <td className="p-3">
                  <Link href={`/admin/customers/${s.id}`} className="font-medium text-ink hover:underline">{s.full_name || s.email}</Link>
                  <div className="text-xs text-muted">{s.email}</div>
                  {(s.roles ?? []).filter((r) => r !== "student").map((r) => <span key={r} className="mr-1 mt-1 inline-block rounded-full bg-surface px-2 py-0.5 text-[11px] capitalize">{r}</span>)}
                </td>
                <td className="p-3">{s.country_code ? countryName(s.country_code) : "—"}</td>
                <td className="p-3 tabular-nums">{s.active_courses}{s.completed_courses > 0 && <span className="text-xs text-muted"> · {s.completed_courses} done</span>}</td>
                <td className="p-3 tabular-nums">{spendText(spend.get(s.id))}</td>
                <td className="p-3">{s.last_activity_at ? formatDate(s.last_activity_at) : "—"}</td>
                <td className="p-3">{formatDate(s.created_at)}</td>
                <td className="p-3">{s.marketing_opt_in ? <span className="text-success">✓ Yes</span> : <span className="text-muted">No</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!rows.length && <p className="fc-card p-8 text-center text-sm text-muted">No customers match these filters.</p>}

      {pages > 1 && (
        <nav className="flex items-center justify-between text-sm">
          {f.page > 1 ? <Link className="underline" href={`/admin/customers?${filtersToQuery({ ...f, page: f.page - 1 })}`}>← Previous</Link> : <span />}
          <span className="text-muted">Page {f.page} of {pages}</span>
          {f.page < pages ? <Link className="underline" href={`/admin/customers?${filtersToQuery({ ...f, page: f.page + 1 })}`}>Next →</Link> : <span />}
        </nav>
      )}
    </div>
  );
}
