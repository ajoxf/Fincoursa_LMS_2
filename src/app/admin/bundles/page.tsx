import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatMoney } from "@/lib/money";
import { Card } from "@/components/dash/Stat";
import { createBundle } from "./actions";

export const metadata: Metadata = { title: "Bundles" };

export default async function AdminBundles() {
  await requireRole(["admin"], "/admin/bundles");
  const { data: bundles } = await createAdminClient()
    .from("bundles").select("id, title, status, prices(amount_minor, currency, is_active), bundle_courses(course_id)").order("sort_order").order("created_at");
  return (
    <div className="grid gap-6">
      <h1 className="text-3xl font-bold text-primary">Bundles &amp; learning paths</h1>
      <Card title="Create a bundle">
        <form action={createBundle} className="flex flex-wrap items-end gap-3">
          <label className="grid min-w-64 flex-1 gap-1 text-sm font-medium">Bundle title<input name="title" required placeholder="e.g. Technical Analysis Track" className="fc-input" /></label>
          <button className="fc-btn fc-btn-primary">Create bundle</button>
        </form>
      </Card>
      <div className="fc-card divide-y divide-line">
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        {(bundles ?? []).map((b: any) => {
          const p = (b.prices ?? []).find((x: { is_active: boolean }) => x.is_active);
          return (
            <Link key={b.id} href={`/admin/bundles/${b.id}`} className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm hover:bg-surface">
              <span className="font-medium">{b.title}</span>
              <span className="flex gap-6 text-muted">
                <span>{b.bundle_courses?.length ?? 0} courses</span>
                <span>{p?.amount_minor ? formatMoney(p.amount_minor, p.currency) : "Free"}</span>
                <span>{b.status}</span>
              </span>
            </Link>
          );
        })}
        {!bundles?.length && <p className="p-6 text-center text-sm text-muted">No bundles yet.</p>}
      </div>
    </div>
  );
}
