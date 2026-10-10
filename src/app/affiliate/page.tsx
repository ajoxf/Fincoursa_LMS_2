import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/format";
import { env, partnerCodesEnabled } from "@/lib/env";
import { Stat, Card, RangePicker, Progress } from "@/components/dash/Stat";
import { ColumnChart } from "@/components/dash/ColumnChart";
import { BarList } from "@/components/dash/BarList";
import { ApplyForm } from "./ApplyForm";
import { CopyButton, LinkBuilder } from "./CopyLink";
import { PayoutForm } from "./PayoutForm";

export const metadata: Metadata = { title: "Partner dashboard" };

/* eslint-disable @typescript-eslint/no-explicit-any */
type Dash = any;
const TABS = [
  { id: "overview", label: "Overview" }, { id: "clients", label: "Clients" }, { id: "commissions", label: "Commissions" },
  { id: "campaigns", label: "Campaigns & links" }, { id: "team", label: "Sub-IBs" }, { id: "payouts", label: "Payouts" },
];
const pct = (a: number, b: number) => (b ? `${((a / b) * 100).toFixed(1)}%` : "—");
const statusTone: Record<string, string> = { pending: "bg-warning/15 text-warning", approved: "bg-success/15 text-success", paid: "bg-primary/10 text-primary", reversed: "bg-danger/10 text-danger" };
const statusLabel: Record<string, string> = { pending: "Pending", approved: "Ready to pay", paid: "Paid", reversed: "Reversed" };

export default async function AffiliatePage({ searchParams }: PageProps<"/affiliate">) {
  const user = await requireUser("/affiliate");
  const sp = await searchParams;
  const days = Math.min(365, Math.max(7, Number(sp.days) || 30));
  const tab = TABS.some((t) => t.id === sp.tab) ? String(sp.tab) : "overview";
  const supabase = await createClient();
  const { data: aff } = await supabase.from("affiliates").select("id, code, status, payout_details").eq("user_id", user.id).maybeSingle();

  if (!aff) {
    const invite = typeof sp.invite === "string" ? sp.invite : undefined;
    return (
      <div className="grid gap-6">
        <div>
          <h1 className="text-3xl font-bold text-primary">Become a FinCoursa partner</h1>
          <p className="mt-2 max-w-2xl text-muted">Affiliates and Introducing Brokers earn commission on every course sale they refer. You get a personal referral link, a live view of your clients, sales and earnings, and you can build your own team of sub-IBs.</p>
        </div>
        <ApplyForm parentCode={invite} />
      </div>
    );
  }
  if (aff.status !== "approved") {
    return (
      <div className="fc-card max-w-lg p-6">
        <h1 className="text-2xl font-bold text-primary">Application {aff.status === "pending" ? "received" : aff.status}</h1>
        <p className="mt-2 text-muted">{aff.status === "pending" ? `We're reviewing your application for code ${aff.code}. You'll get an email once it's approved.` : "Your partner account is not active. Please contact us."}</p>
      </div>
    );
  }

  const cur = env.defaultCurrency;
  const m = (n: number | string) => formatMoney(Number(n), cur);
  const { data: d } = (await supabase.rpc("affiliate_dashboard", { p_days: days })) as { data: Dash };
  const p = d.profile, money = d.money;
  const base = `/affiliate?tab=${tab}`;
  const isMaster = (d.sub_ibs ?? []).length > 0;

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-primary">Partner dashboard</h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
            <span className="rounded-button bg-primary px-2 py-0.5 font-mono text-xs text-white">{p.code}</span>
            {isMaster && <span className="rounded-button bg-accent/20 px-2 py-0.5 text-xs font-semibold text-primary">Master IB</span>}
            {p.parent_code && <span className="rounded-button bg-surface px-2 py-0.5 text-xs">Sub-IB of {p.parent_code}</span>}
            <span>{Number(p.commission_pct)}% commission</span>·<span>{p.cookie_days}-day cookie</span>
            {p.joined && <><span>·</span><span>Partner since {formatDate(p.joined)}</span></>}
          </p>
        </div>
        <RangePicker current={days} base={base} />
      </div>

      <nav className="flex gap-1 overflow-x-auto border-b border-line text-sm">
        {TABS.map((t) => (
          <Link key={t.id} href={`/affiliate?tab=${t.id}&days=${days}`}
            className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 ${tab === t.id ? "border-accent font-semibold text-primary" : "border-transparent text-muted hover:text-primary"}`}>{t.label}</Link>
        ))}
      </nav>

      {tab === "overview" && <Overview d={d} m={m} days={days} />}
      {tab === "clients" && <Clients m={m} />}
      {tab === "commissions" && <Commissions m={m} days={days} />}
      {tab === "campaigns" && <Campaigns d={d} m={m} code={p.code} />}
      {tab === "team" && <Team d={d} m={m} code={p.code} />}
      {tab === "payouts" && <Payouts m={m} details={(aff.payout_details ?? {}) as any} money={money} />}
      {!p.has_payout_details && tab !== "payouts" && (
        <p className="rounded-card bg-warning/10 p-4 text-sm text-warning">Add your payout details so we can pay you. <Link href="/affiliate?tab=payouts" className="font-semibold underline">Add them now</Link></p>
      )}
    </div>
  );

}

function Balances({ money, m }: { money: Dash; m: (n: number) => string }) {
  return (
    <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
      <Stat label="Pending" value={m(money.pending_minor)} hint={money.next_release_at ? `${m(money.next_release_minor)} becomes payable ${formatDate(money.next_release_at)}` : "30-day refund window"} />
      <Stat label="Ready for payout" value={m(money.approved_minor)} hint="Paid in the next payout run" />
      <Stat label="Paid to you" value={m(money.paid_minor)} />
      <Stat label="Lifetime earnings" value={m(money.lifetime_minor)} />
    </div>
  );
}

function Overview({ d, m, days }: { d: Dash; m: (n: number) => string; days: number }) {
  const f = d.funnel, money = d.money;
  const series = d.series as { day: string; clicks: number; signups: number; sales: number; commission_minor: number }[];
  const steps = [
    { label: "Clicks", value: Number(f.clicks) },
    { label: "Unique visitors", value: Number(f.unique_visitors) },
    { label: "Sign-ups", value: Number(f.signups) },
    { label: "Buying clients", value: Number(f.buyers) },
  ];
  return (
    <>
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <Stat label={`Commission, last ${days} days`} value={m(money.commission_minor)}
          hint={Number(money.override_minor) > 0 ? `${m(money.direct_minor)} direct + ${m(money.override_minor)} from sub-IBs` : "from your direct referrals"} />
        <Stat label="Revenue you referred" value={m(money.referred_revenue_minor)} hint="excl. VAT and refunds" />
        <Stat label="Sales" value={f.sales} hint={`${f.buyers} buying clients`} />
        <Stat label="Click → sale conversion" value={pct(Number(f.sales), Number(f.clicks))} hint={`${f.clicks} clicks`} />
      </div>
      <Balances money={money} m={m} />
      <div className="grid gap-6 xl:grid-cols-[1fr_1.4fr]">
        <Card title="Conversion funnel">
          <BarList rows={steps.map((s, i) => ({ label: s.label, value: s.value, sub: i === 0 ? undefined : `${pct(s.value, steps[i - 1].value)} of previous` }))} format={(n) => n.toLocaleString()} />
        </Card>
        <Card title="Commission per day"><ColumnChart label="Commission" currency="AED" data={series.map((x) => ({ x: x.day, y: Number(x.commission_minor) }))} /></Card>
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="Clicks per day"><ColumnChart label="Clicks" data={series.map((x) => ({ x: x.day, y: Number(x.clicks) }))} /></Card>
        <Card title="Sign-ups per day"><ColumnChart label="Sign-ups" data={series.map((x) => ({ x: x.day, y: Number(x.signups) }))} /></Card>
      </div>
      <Card title="Top courses you sold">
          <BarList rows={(d.courses ?? []).slice(0, 6).map((c: Dash) => ({ label: c.title, value: Number(c.revenue_minor), sub: `${c.sales} sales · ${m(c.commission_minor)} commission` }))} format={m} empty="No sales yet" />
      </Card>
      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="Where your clicks come from">
          <BarList rows={(d.sources ?? []).map((s: Dash) => ({ label: s.source, value: Number(s.clicks) }))} format={(n) => `${n} clicks`} />
        </Card>
        <Card title="Countries">
          <BarList rows={(d.countries ?? []).map((c: Dash) => ({ label: c.country?.trim() || "Unknown", value: Number(c.sales), sub: `${c.clicks} clicks` }))} format={(n) => `${n} sales`} />
        </Card>
      </div>
    </>
  );
}

async function Clients({ m }: { m: (n: number) => string }) {
  const { data: rows } = await (await createClient()).rpc("affiliate_clients", { p_limit: 500 });
  const list = (rows ?? []) as Dash[];
  const buyers = list.filter((r) => Number(r.orders) > 0).length;
  return (
    <>
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <Stat label="Clients" value={list.length} hint="signed up or bought through you" />
        <Stat label="Buying clients" value={buyers} hint={pct(buyers, list.length) + " of clients"} />
        <Stat label="Revenue from clients" value={m(list.reduce((a, r) => a + Number(r.revenue_minor), 0))} />
        <Stat label="Avg. course progress" value={`${Math.round(list.filter((r) => r.avg_progress != null).reduce((a, r, _i, arr) => a + Number(r.avg_progress) / arr.length, 0))}%`} hint="how engaged your clients are" />
      </div>
      <div className="fc-card overflow-x-auto">
        <table className="w-full min-w-[980px] text-sm">
          <thead className="text-left text-muted"><tr>
            {["Client", "Joined", "How", "Country", "Orders", "Revenue", "Your commission", "Courses", "Progress", "Last active"].map((h) => <th key={h} className="p-3 font-medium">{h}</th>)}
          </tr></thead>
          <tbody>
            {list.map((r, i) => (
              <tr key={i} className="border-t border-line">
                <td className="p-3"><div className="font-medium">{r.client}</div><div className="text-xs text-muted">{r.email}</div></td>
                <td className="p-3">{formatDate(r.joined_at)}</td>
                <td className="p-3 text-xs">{r.source}</td>
                <td className="p-3">{r.country ?? "—"}</td>
                <td className="p-3 tabular-nums">{r.orders}</td>
                <td className="p-3 tabular-nums">{m(r.revenue_minor)}</td>
                <td className="p-3 tabular-nums font-medium">{m(r.commission_minor)}</td>
                <td className="p-3 tabular-nums">{r.courses}</td>
                <td className="w-36 p-3">{r.avg_progress != null ? <Progress pct={Number(r.avg_progress)} /> : <span className="text-muted">—</span>}</td>
                <td className="p-3">{r.last_active ? formatDate(r.last_active) : "—"}</td>
              </tr>
            ))}
            {!list.length && <tr><td colSpan={10} className="p-8 text-center text-muted">No clients yet. Share your link to bring your first one.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted">For privacy, clients are shown by first name and last initial with a masked email.</p>
    </>
  );
}

async function Commissions({ m, days }: { m: (n: number) => string; days: number }) {
  const span = Math.max(days, 90);
  const { data: rows } = await (await createClient()).rpc("affiliate_statement", { p_days: span });
  const list = (rows ?? []) as Dash[];
  const sum = (s: string) => list.filter((r) => r.status === s).reduce((a, r) => a + Number(r.amount_minor), 0);
  return (
    <>
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <Stat label="Pending" value={m(sum("pending"))} hint="inside the 30-day refund window" />
        <Stat label="Ready to pay" value={m(sum("approved"))} />
        <Stat label="Paid" value={m(sum("paid"))} />
        <Stat label="Reversed (refunds)" value={m(sum("reversed"))} />
      </div>
      <Card title={`Commission statement · last ${span} days`} action={<a href={`/api/affiliate/statement?days=${span}`} className="fc-btn fc-btn-outline !px-4 !py-1.5 text-sm">Download CSV</a>}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px] text-sm">
            <thead className="text-left text-muted"><tr>
              {["Date", "Order", "Course", "Client", "Source", "Sale (net)", "Rate", "Commission", "Status", "Payable / paid"].map((h) => <th key={h} className="py-2 pr-3 font-medium">{h}</th>)}
            </tr></thead>
            <tbody>
              {list.map((r) => (
                <tr key={`${r.order_number}-${r.tier}`} className="border-t border-line">
                  <td className="py-2 pr-3">{formatDate(r.created_at)}</td>
                  <td className="py-2 pr-3 tabular-nums">#{r.order_number}</td>
                  <td className="max-w-56 truncate py-2 pr-3">{r.items}</td>
                  <td className="py-2 pr-3">{r.client}</td>
                  <td className="py-2 pr-3 text-xs">{r.via === "link" ? "Link" : r.via === "coupon" ? "Code" : r.via}{r.campaign && <span className="text-muted"> · {r.campaign}</span>}</td>
                  <td className="py-2 pr-3 tabular-nums">{m(r.sale_minor)}</td>
                  <td className="py-2 pr-3 tabular-nums">{Number(r.pct)}%{r.tier === 2 && <span className="text-xs text-muted"> override</span>}</td>
                  <td className="py-2 pr-3 tabular-nums font-medium">{m(r.amount_minor)}</td>
                  <td className="py-2 pr-3"><span className={`rounded-button px-2 py-0.5 text-xs font-semibold ${statusTone[r.status]}`}>{statusLabel[r.status]}</span></td>
                  <td className="py-2 pr-3 text-xs">{r.status === "paid" ? `Paid ${formatDate(r.paid_at)}` : r.status === "reversed" ? "—" : formatDate(r.available_at)}</td>
                </tr>
              ))}
              {!list.length && <tr><td colSpan={10} className="py-8 text-center text-muted">No commissions in this period.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
      <p className="text-xs text-muted">Commission is calculated on the sale price excluding VAT. It stays pending for 30 days so refunds can be handled; a refunded sale reverses its commission.</p>
    </>
  );
}

async function Campaigns({ d, m, code }: { d: Dash; m: (n: number) => string; code: string }) {
  const { data: courses } = await (await createClient()).from("courses").select("slug, title").eq("status", "published").order("sort_order");
  return (
    <>
      <Card title="Build a tracked link"><LinkBuilder base={env.siteUrl} code={code} courses={courses ?? []} /></Card>
      <Card title="Campaign performance">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="text-left text-muted"><tr>{["Campaign", "Clicks", "Sales", "Conversion", "Revenue", "Commission"].map((h) => <th key={h} className="py-2 pr-3 font-medium">{h}</th>)}</tr></thead>
            <tbody>
              {(d.campaigns ?? []).map((c: Dash) => (
                <tr key={c.campaign} className="border-t border-line">
                  <td className="py-2 pr-3 font-medium">{c.campaign === "(none)" ? <span className="text-muted">No tag</span> : c.campaign}</td>
                  <td className="py-2 pr-3 tabular-nums">{c.clicks}</td>
                  <td className="py-2 pr-3 tabular-nums">{c.sales}</td>
                  <td className="py-2 pr-3 tabular-nums">{pct(Number(c.sales), Number(c.clicks))}</td>
                  <td className="py-2 pr-3 tabular-nums">{m(c.revenue_minor)}</td>
                  <td className="py-2 pr-3 tabular-nums font-medium">{m(c.commission_minor)}</td>
                </tr>
              ))}
              {!(d.campaigns ?? []).length && <tr><td colSpan={6} className="py-6 text-center text-muted">No campaign data yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
      {partnerCodesEnabled && <Card title="Your partner codes">
        {(d.coupons ?? []).length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-sm">
              <thead className="text-left text-muted"><tr>{["Code", "Discount", "Used", "Sales credited", "Commission", "Valid until", ""].map((h) => <th key={h} className="py-2 pr-3 font-medium">{h}</th>)}</tr></thead>
              <tbody>
                {d.coupons.map((c: Dash) => (
                  <tr key={c.code} className="border-t border-line">
                    <td className="py-2 pr-3 font-mono font-semibold">{c.code}</td>
                    <td className="py-2 pr-3">{c.percent_off ? `${Number(c.percent_off)}% off` : m(c.amount_off_minor) + " off"}</td>
                    <td className="py-2 pr-3 tabular-nums">{c.redeemed}{c.max_redemptions ? ` / ${c.max_redemptions}` : ""}</td>
                    <td className="py-2 pr-3 tabular-nums">{c.sales}</td>
                    <td className="py-2 pr-3 tabular-nums">{m(c.commission_minor)}</td>
                    <td className="py-2 pr-3">{c.is_active ? (c.ends_at ? formatDate(c.ends_at) : "No expiry") : "Inactive"}</td>
                    <td className="py-2 pr-3 text-right"><CopyButton text={c.code} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="text-sm text-muted">No partner codes yet. Ask the FinCoursa team for a discount code for your audience. A sale using your code is credited to you when the buyer didn&apos;t come through another partner&apos;s link.</p>}
      </Card>}
    </>
  );
}

function Team({ d, m, code }: { d: Dash; m: (n: number) => string; code: string }) {
  const invite = `${env.siteUrl}/affiliate?invite=${code}`;
  const subs = (d.sub_ibs ?? []) as Dash[];
  return (
    <>
      <Card title="Invite sub-IBs">
        <p className="text-sm text-muted">Partners who join through this link become your sub-IBs. You earn an override on every sale they make, on top of their own commission. It doesn&apos;t reduce theirs.</p>
        <div className="mt-3 flex gap-2"><input readOnly value={invite} className="fc-input font-mono text-xs" /><CopyButton text={invite} /></div>
      </Card>
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <Stat label="Sub-IBs" value={subs.length} hint={`${subs.filter((s) => s.status === "approved").length} active`} />
        <Stat label="Their sales (period)" value={subs.reduce((a, s) => a + Number(s.sales), 0)} />
        <Stat label="Their referred revenue" value={m(subs.reduce((a, s) => a + Number(s.revenue_minor), 0))} />
        <Stat label="Your override earnings" value={m(d.money.override_minor)} />
      </div>
      <div className="fc-card overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="text-left text-muted"><tr>{["Sub-IB", "Code", "Status", "Joined", "Clicks", "Sales", "Revenue", "Your override"].map((h) => <th key={h} className="p-3 font-medium">{h}</th>)}</tr></thead>
          <tbody>
            {subs.map((s) => (
              <tr key={s.code} className="border-t border-line">
                <td className="p-3 font-medium">{s.name}</td>
                <td className="p-3 font-mono">{s.code}</td>
                <td className="p-3">{s.status}</td>
                <td className="p-3">{s.joined ? formatDate(s.joined) : "—"}</td>
                <td className="p-3 tabular-nums">{s.clicks}</td>
                <td className="p-3 tabular-nums">{s.sales}</td>
                <td className="p-3 tabular-nums">{m(s.revenue_minor)}</td>
                <td className="p-3 tabular-nums font-medium">{m(s.override_minor)} <span className="text-xs text-muted">({Number(s.override_pct)}%)</span></td>
              </tr>
            ))}
            {!subs.length && <tr><td colSpan={8} className="p-8 text-center text-muted">No sub-IBs yet. Share your invite link with other partners.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

async function Payouts({ m, details, money }: { m: (n: number) => string; details: Dash; money: Dash }) {
  const { data: payouts } = await (await createClient())
    .from("payouts").select("id, amount_minor, currency, status, method, reference, created_at, paid_at").eq("payee_type", "affiliate").order("created_at", { ascending: false });
  return (
    <>
      <Balances money={money} m={m} />
      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="Payout history">
          <ul className="divide-y divide-line text-sm">
            {(payouts ?? []).map((p) => (
              <li key={p.id} className="flex flex-wrap justify-between gap-2 py-2">
                <span>{formatDate(p.paid_at ?? p.created_at)} · {p.status === "paid" ? "Paid" : p.status}{p.method && ` · ${p.method}`}{p.reference && <span className="text-muted"> · ref {p.reference}</span>}</span>
                <span className="tabular-nums font-medium">{formatMoney(p.amount_minor, p.currency)}</span>
              </li>
            ))}
            {!payouts?.length && <li className="py-4 text-muted">No payouts yet. Commissions become payable 30 days after each sale and are paid in the next payout run.</li>}
          </ul>
        </Card>
        <Card title="Payout details"><PayoutForm details={details} /></Card>
      </div>
    </>
  );
}
