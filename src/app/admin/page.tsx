import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/money";
import { env } from "@/lib/env";
import { Stat, Card, RangePicker } from "@/components/dash/Stat";
import { ColumnChart } from "@/components/dash/ColumnChart";
import { BarList } from "@/components/dash/BarList";

export const metadata: Metadata = { title: "Admin overview" };

/** [start of day N-1 days ago, start of tomorrow) in UTC. */
function reportWindow(days: number) {
  const to = new Date();
  to.setUTCHours(24, 0, 0, 0);
  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - days);
  return { from: from.toISOString(), to: to.toISOString() };
}

type Row = { label: string; net_minor: number; orders: number };

export default async function AdminOverview({ searchParams }: PageProps<"/admin">) {
  await requireRole(["admin", "finance"], "/admin");
  const sp = await searchParams;
  const days = Math.min(365, Math.max(7, Number(sp.days) || 30));
  const cur = (typeof sp.currency === "string" ? sp.currency : env.defaultCurrency).toUpperCase();
  const { from, to } = reportWindow(days);
  const args = { p_from: from, p_to: to, p_currency: cur };

  const supabase = await createClient();
  const [kpi, series, byCourse, byChannel, byGateway, byCountry, recent] = await Promise.all([
    supabase.rpc("admin_kpis", args),
    supabase.rpc("admin_revenue_series", args),
    supabase.rpc("admin_revenue_breakdown", { ...args, p_dimension: "course" }),
    supabase.rpc("admin_revenue_breakdown", { ...args, p_dimension: "channel" }),
    supabase.rpc("admin_revenue_breakdown", { ...args, p_dimension: "gateway" }),
    supabase.rpc("admin_revenue_breakdown", { ...args, p_dimension: "country" }),
    supabase.from("orders").select("id, number, status, total_minor, currency, paid_at, order_items(title)").neq("status", "pending").order("created_at", { ascending: false }).limit(8),
  ]);
  const k = kpi.data ?? {};
  const m = (n: number) => formatMoney(n, cur);
  const rows = (d: Row[] | null) => (d ?? []).map((r) => ({ label: r.label, value: Number(r.net_minor), sub: `${r.orders} orders` }));

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-bold text-primary">Overview</h1>
        <RangePicker current={days} base={`/admin?currency=${cur}`} />
      </div>
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <Stat label="Net revenue" value={m(k.net_minor ?? 0)} hint="after VAT and refunds" />
        <Stat label="Gross sales" value={m(k.gross_minor ?? 0)} hint={`${k.orders ?? 0} orders · avg ${m(k.aov_minor ?? 0)}`} />
        <Stat label="Refunds" value={m(k.refunds_minor ?? 0)} />
        <Stat label="VAT collected" value={m(k.tax_minor ?? 0)} />
        <Stat label="New students" value={k.new_students ?? 0} />
        <Stat label="Enrollments" value={k.enrollments ?? 0} />
        <Stat label="Course completions" value={k.completions ?? 0} />
        <Stat label="Owed to instructors / affiliates" value={m(Number(k.instructor_payable_minor ?? 0) + Number(k.affiliate_payable_minor ?? 0))}
          hint={<Link href="/admin/payouts" className="underline">Go to payouts</Link>} />
      </div>
      <Card title="Net revenue per day">
        <ColumnChart label="Net revenue" format={m} data={(series.data ?? []).map((r: { day: string; net_minor: number }) => ({ x: r.day, y: Number(r.net_minor) }))} />
      </Card>
      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="By course"><BarList rows={rows(byCourse.data)} format={m} /></Card>
        <Card title="By channel"><BarList rows={rows(byChannel.data)} format={m} /></Card>
        <Card title="By payment gateway"><BarList rows={rows(byGateway.data)} format={m} /></Card>
        <Card title="By country"><BarList rows={rows(byCountry.data)} format={m} /></Card>
      </div>
      <Card title="Latest orders" action={<Link href="/admin/orders" className="text-sm underline">All orders</Link>}>
        <ul className="divide-y divide-line text-sm">
          {(recent.data ?? []).map((o) => (
            <li key={o.id} className="flex justify-between gap-4 py-2">
              <span>#{o.number} · {o.order_items?.map((i) => i.title).join(", ")} <span className="text-muted">· {o.status}</span></span>
              <span className="tabular-nums">{formatMoney(o.total_minor, o.currency)}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
