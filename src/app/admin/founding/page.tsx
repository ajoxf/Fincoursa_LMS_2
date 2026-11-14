import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { env } from "@/lib/env";
import { minorUnitsFactor } from "@/lib/money";
import { formatDate } from "@/lib/format";
import { getFoundingSettings, joiningOpen } from "@/lib/founding";
import { Card, Stat } from "@/components/dash/Stat";
import { addFoundingMember, saveFoundingSettings, setFoundingActive } from "./actions";

export const metadata: Metadata = { title: "Founding members" };

type Member = {
  user_id: string; member_number: number; source: string; note: string | null; joined_at: string; revoked_at: string | null;
  profile: { email: string | null; full_name: string | null } | null; order: { number: number } | null;
};

const day = (iso: string | null) => (iso ? iso.slice(0, 10) : "");
const major = (minor: number | undefined, c: string) => (minor ? String(minor / minorUnitsFactor(c)) : "");

export default async function AdminFounding({ searchParams }: PageProps<"/admin/founding">) {
  await requireRole(["admin", "finance"], "/admin/founding");
  const sp = await searchParams;
  const ok = typeof sp.ok === "string" ? sp.ok : null;
  const err = typeof sp.err === "string" ? sp.err : null;
  const db = createAdminClient();
  const [s, { data: members }, { data: courses }, { data: prices }] = await Promise.all([
    getFoundingSettings(),
    db.from("founding_members")
      .select("user_id, member_number, source, note, joined_at, revoked_at, profile:profiles!founding_members_user_id_fkey(email, full_name), order:orders(number)")
      .order("member_number", { ascending: true }),
    db.from("courses").select("id, title").neq("status", "archived").order("title"),
    db.from("prices").select("currency").eq("is_active", true),
  ]);
  const list = (members ?? []) as unknown as Member[];
  const active = list.filter((m) => !m.revoked_at).length;
  const currencies = [...new Set([env.defaultCurrency, ...(prices ?? []).map((p) => String(p.currency).toUpperCase())])].sort();
  const open = joiningOpen(s);

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-3xl font-bold text-primary">Founding members</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted">
          Anyone who buys one of the chosen courses while joining is open becomes a founding member and gets a discount on their
          future purchases, applied automatically at checkout. Members see a badge on their dashboard. A full refund of the order
          that made someone a member ends the membership.
        </p>
      </div>
      {ok && <p className="rounded-lg bg-success/10 p-3 text-sm text-success">{ok}</p>}
      {err && <p className="rounded-lg bg-danger/10 p-3 text-sm text-danger">{err}</p>}

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        <Stat label="Founding members" value={`${active}${s.cap ? ` / ${s.cap}` : ""}`} />
        <Stat label="Joining" value={!s.enabled ? "Off" : open ? "Open" : "Closed"} hint={s.join_ends_at ? `until ${formatDate(s.join_ends_at)}` : undefined} />
        <Stat label="Member discount" value={s.mode === "percent" ? `${s.percent}%` : "Fixed amount"} hint={s.benefit_ends_at ? `until ${formatDate(s.benefit_ends_at)}` : "for life"} />
      </div>

      <Card title="Settings">
        <form action={saveFoundingSettings} className="grid gap-5 text-sm">
          <label className="flex items-center gap-2 text-base font-medium">
            <input type="checkbox" name="enabled" defaultChecked={s.enabled} /> Founding members are {s.enabled ? <span className="text-success">on</span> : <span className="text-muted">off</span>}
          </label>

          <fieldset className="grid gap-2 rounded-lg border border-line p-4">
            <legend className="px-1 font-medium">Who becomes a member</legend>
            <p className="text-xs text-muted">Buying any of these courses makes the buyer a founding member.</p>
            <div className="grid gap-1 sm:grid-cols-2">
              {(courses ?? []).map((c) => (
                <label key={c.id} className="flex items-center gap-2">
                  <input type="checkbox" name="qualifying" value={c.id} defaultChecked={s.qualifying_course_ids.includes(c.id)} /> {c.title}
                </label>
              ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-4">
              <label className="grid gap-1">Joining closes on<input type="date" name="join_ends_at" defaultValue={day(s.join_ends_at)} className="fc-input" />
                <span className="text-xs text-muted">Empty = open until switched off.</span></label>
              <label className="grid gap-1">Member limit<input name="cap" defaultValue={s.cap ?? ""} inputMode="numeric" placeholder="No limit" className="fc-input w-32" />
                <span className="text-xs text-muted">e.g. the first 100 buyers.</span></label>
            </div>
          </fieldset>

          <fieldset className="grid gap-3 rounded-lg border border-line p-4">
            <legend className="px-1 font-medium">Members&apos; discount on future purchases</legend>
            <label className="flex flex-wrap items-center gap-2">
              <input type="radio" name="mode" value="percent" defaultChecked={s.mode !== "fixed"} /> Percentage off
              <input name="percent" defaultValue={s.percent} inputMode="decimal" aria-label="Discount percent" className="fc-input w-24 !py-1.5" /> %
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2"><input type="radio" name="mode" value="fixed" defaultChecked={s.mode === "fixed"} /> Fixed amount off</label>
              {currencies.map((c) => (
                <label key={c} className="flex items-center gap-1">{c}
                  <input name={`fixed_${c}`} defaultValue={major(s.fixed?.[c], c)} inputMode="decimal" placeholder="0" className="fc-input w-24 !py-1.5" />
                </label>
              ))}
            </div>
            <label className="grid gap-1">Discount ends on<input type="date" name="benefit_ends_at" defaultValue={day(s.benefit_ends_at)} className="fc-input w-48" />
              <span className="text-xs text-muted">Empty = for life.</span></label>
            <label className="flex items-center gap-2"><input type="checkbox" name="allow_with_coupon" defaultChecked={s.allow_with_coupon} /> Can be combined with a discount code (otherwise the larger of the two applies)</label>
          </fieldset>
          <button className="fc-btn fc-btn-dark justify-self-start !min-w-0 !px-5 !py-2">Save settings</button>
        </form>
      </Card>

      <Card title="Add a member">
        <form action={addFoundingMember} className="flex flex-wrap items-end gap-3 text-sm">
          <label className="grid gap-1">Customer email<input name="email" type="email" required className="fc-input w-64" /></label>
          <label className="grid gap-1">Note (optional)<input name="note" maxLength={200} placeholder="e.g. Beta tester" className="fc-input w-64" /></label>
          <button className="fc-btn fc-btn-dark !min-w-0 !px-5 !py-2">Add</button>
        </form>
      </Card>

      <Card title={`Members (${list.length})`}>
        {list.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-muted">
                <tr><th className="py-2 pr-3">#</th><th className="pr-3">Member</th><th className="pr-3">How</th><th className="pr-3">Joined</th><th className="pr-3">Status</th><th /></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {list.map((m) => (
                  <tr key={m.user_id} className={m.revoked_at ? "text-muted" : ""}>
                    <td className="py-2 pr-3">{m.member_number}</td>
                    <td className="py-2 pr-3">{m.profile?.full_name || m.profile?.email}{m.profile?.full_name && <span className="block text-xs text-muted">{m.profile.email}</span>}</td>
                    <td className="py-2 pr-3">{m.source === "purchase" ? `Order #${m.order?.number ?? ""}` : "Added by admin"}{m.note ? ` · ${m.note}` : ""}</td>
                    <td className="py-2 pr-3">{formatDate(m.joined_at)}</td>
                    <td className="py-2 pr-3">{m.revoked_at ? "Removed" : "Active"}</td>
                    <td className="py-2 text-right">
                      <form><button formAction={setFoundingActive.bind(null, m.user_id, Boolean(m.revoked_at))} className="text-xs underline">{m.revoked_at ? "Restore" : "Remove"}</button></form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="text-sm text-muted">No founding members yet.</p>}
      </Card>
    </div>
  );
}
