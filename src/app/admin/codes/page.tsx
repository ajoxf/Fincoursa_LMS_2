import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { env } from "@/lib/env";
import { formatMoney } from "@/lib/money";
import { Card } from "@/components/dash/Stat";
import { CodeForm } from "./CodeForm";
import { deleteCode, setCodeActive } from "./actions";

export const metadata: Metadata = { title: "Discount codes" };

type Row = {
  id: string; code: string; percent_off: number | null; amount_off_minor: number | null; currency: string | null;
  max_redemptions: number | null; redeemed_count: number; starts_at: string | null; ends_at: string | null; is_active: boolean;
  course: { title: string } | null; bundle: { title: string } | null; affiliate: { code: string | null } | null;
};

const fmtDay = (s: string | null) => (s ? new Date(s).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : null);

function status(c: Row, now: Date): { label: string; cls: string } {
  if (!c.is_active) return { label: "Off", cls: "bg-surface text-muted" };
  if (c.ends_at && new Date(c.ends_at) < now) return { label: "Expired", cls: "bg-surface text-muted" };
  if (c.max_redemptions != null && c.redeemed_count >= c.max_redemptions) return { label: "Used up", cls: "bg-surface text-muted" };
  if (c.starts_at && new Date(c.starts_at) > now) return { label: "Scheduled", cls: "bg-warning/15 text-warning" };
  return { label: "Active", cls: "bg-success/15 text-success" };
}

export default async function AdminCodes() {
  await requireRole(["admin", "finance"], "/admin/codes");
  const db = createAdminClient();
  const [{ data: codes }, { data: courses }, { data: bundles }, { data: prices }] = await Promise.all([
    db.from("coupons")
      .select("id, code, percent_off, amount_off_minor, currency, max_redemptions, redeemed_count, starts_at, ends_at, is_active, course:courses(title), bundle:bundles(title), affiliate:affiliates(code)")
      .order("created_at", { ascending: false }),
    db.from("courses").select("id, title").neq("status", "archived").order("title"),
    db.from("bundles").select("id, title").neq("status", "archived").order("title"),
    db.from("prices").select("currency").eq("is_active", true),
  ]);
  const currencies = [...new Set([env.defaultCurrency, ...(prices ?? []).map((p) => String(p.currency).toUpperCase())])].sort();
  const now = new Date();
  const list = (codes ?? []) as unknown as Row[];

  return (
    <div className="grid gap-6">
      <h1 className="text-3xl font-bold text-primary">Discount codes</h1>
      <Card title="Create a code">
        <CodeForm courses={courses ?? []} bundles={bundles ?? []} currencies={currencies} defaultCurrency={env.defaultCurrency} />
      </Card>
      <Card title={`All codes (${list.length})`}>
        {list.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-muted">
                <tr><th className="py-2 pr-3">Code</th><th className="pr-3">Discount</th><th className="pr-3">Applies to</th><th className="pr-3">Used</th><th className="pr-3">Valid</th><th className="pr-3">Status</th><th /></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {list.map((c) => {
                  const s = status(c, now);
                  const from = fmtDay(c.starts_at), to = fmtDay(c.ends_at);
                  const unused = (c.redeemed_count ?? 0) === 0;
                  return (
                    <tr key={c.id} className="align-top">
                      <td className="py-3 pr-3">
                        <span className="font-mono font-semibold">{c.code}</span>
                        {c.affiliate && <span className="mt-0.5 block text-xs text-muted">Affiliate {c.affiliate.code ?? ""}</span>}
                      </td>
                      <td className="py-3 pr-3">{c.percent_off ? `${Number(c.percent_off)}% off` : `${formatMoney(c.amount_off_minor, c.currency ?? env.defaultCurrency)} off`}</td>
                      <td className="py-3 pr-3">{c.course ? c.course.title : c.bundle ? `Programme: ${c.bundle.title}` : "Everything"}</td>
                      <td className="py-3 pr-3">{c.redeemed_count}{c.max_redemptions != null ? ` / ${c.max_redemptions}` : ""}</td>
                      <td className="py-3 pr-3 text-muted">{from || to ? `${from ?? "now"} – ${to ?? "no end"}` : "Always"}</td>
                      <td className="py-3 pr-3"><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${s.cls}`}>{s.label}</span></td>
                      <td className="py-3">
                        <form className="flex justify-end gap-3 text-xs">
                          <button formAction={setCodeActive.bind(null, c.id, !c.is_active)} className="underline">{c.is_active ? "Switch off" : "Switch on"}</button>
                          {unused && <button formAction={deleteCode.bind(null, c.id)} className="text-danger underline">Delete</button>}
                        </form>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : <p className="text-sm text-muted">No codes yet.</p>}
        <p className="mt-3 text-xs text-muted">A code that has been used can be switched off but not deleted, so past orders keep the code they used.</p>
      </Card>
    </div>
  );
}
