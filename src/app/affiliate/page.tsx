import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/money";
import { env } from "@/lib/env";
import { Stat, Card, RangePicker } from "@/components/dash/Stat";
import { ColumnChart } from "@/components/dash/ColumnChart";
import { ApplyForm } from "./ApplyForm";
import { LinkBuilder } from "./CopyLink";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Affiliate" };

type Day = { day: string; clicks: number; conversions: number; commission_minor: number };

export default async function AffiliatePage({ searchParams }: PageProps<"/affiliate">) {
  const user = await requireUser("/affiliate");
  const days = Math.min(365, Math.max(7, Number((await searchParams).days) || 30));
  const supabase = await createClient();
  const { data: aff } = await supabase.from("affiliates").select("id, code, status, commission_pct").eq("user_id", user.id).maybeSingle();

  if (!aff) {
    return (
      <div className="grid gap-6">
        <div>
          <h1 className="text-3xl font-bold text-primary">Become a FinCoursa affiliate</h1>
          <p className="mt-2 max-w-2xl text-muted">Share FinCoursa courses with your audience and earn commission on every sale you refer. You&apos;ll get a personal link and a live dashboard of clicks, sales and earnings.</p>
        </div>
        <ApplyForm />
      </div>
    );
  }
  if (aff.status !== "approved") {
    return (
      <div className="fc-card max-w-lg p-6">
        <h1 className="text-2xl font-bold text-primary">Application {aff.status === "pending" ? "received" : aff.status}</h1>
        <p className="mt-2 text-muted">{aff.status === "pending" ? `We're reviewing your application for code ${aff.code}. You'll get an email once it's approved.` : "Your affiliate account is not active. Please contact us."}</p>
      </div>
    );
  }

  const cur = env.defaultCurrency;
  const m = (n: number) => formatMoney(n, cur);
  const [{ data: s }, { data: commissions }] = await Promise.all([
    supabase.rpc("affiliate_summary", { p_days: days }),
    supabase.from("affiliate_commissions").select("id, amount_minor, currency, status, created_at, net_revenue_minor").order("created_at", { ascending: false }).limit(20),
  ]);
  const series = (s?.series ?? []) as Day[];
  const conv = s?.clicks ? ((s.conversions / s.clicks) * 100).toFixed(1) : "0.0";

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-primary">Affiliate dashboard</h1>
          <p className="text-sm text-muted">Code {aff.code} · {Number(aff.commission_pct)}% commission · {s?.cookie_days}-day cookie</p>
        </div>
        <RangePicker current={days} base="/affiliate" />
      </div>
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <Stat label="Clicks" value={s?.clicks ?? 0} hint={`${s?.unique_visitors ?? 0} unique visitors`} />
        <Stat label="Sales" value={s?.conversions ?? 0} hint={`${conv}% of clicks`} />
        <Stat label="Revenue referred" value={m(s?.referred_revenue_minor ?? 0)} hint="excl. VAT" />
        <Stat label="Commission earned" value={m(series.reduce((a, d) => a + Number(d.commission_minor), 0))} hint={`last ${days} days`} />
      </div>
      <div className="grid grid-cols-3 gap-4">
        <Stat label="Pending" value={m(s?.pending_minor ?? 0)} hint="30-day refund window" />
        <Stat label="Ready for payout" value={m(s?.approved_minor ?? 0)} />
        <Stat label="Paid" value={m(s?.paid_minor ?? 0)} />
      </div>
      <Card title="Your referral link"><LinkBuilder base={env.siteUrl} code={aff.code} /></Card>
      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="Clicks per day"><ColumnChart label="Clicks" data={series.map((d) => ({ x: d.day, y: Number(d.clicks) }))} /></Card>
        <Card title="Commission per day"><ColumnChart label="Commission" currency={cur} data={series.map((d) => ({ x: d.day, y: Number(d.commission_minor) }))} /></Card>
      </div>
      <Card title="Recent commissions">
        <ul className="divide-y divide-line text-sm">
          {(commissions ?? []).map((c) => (
            <li key={c.id} className="flex justify-between gap-4 py-2">
              <span>{formatDate(c.created_at)} · sale of {formatMoney(c.net_revenue_minor, c.currency)}</span>
              <span className="tabular-nums">{formatMoney(c.amount_minor, c.currency)} <span className="text-muted">· {c.status}</span></span>
            </li>
          ))}
          {!commissions?.length && <li className="py-4 text-center text-muted">No referred sales yet — share your link to get started.</li>}
        </ul>
      </Card>
    </div>
  );
}
