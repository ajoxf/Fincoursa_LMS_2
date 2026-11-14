import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { daysAgoIso, formatDate, nowIso } from "@/lib/format";
import { channelLabel, CHANNELS, fmtUsd, marketingReport, type Row } from "@/lib/marketing-metrics";
import { processTodos, STAGES, stageName } from "@/lib/campaign-process";
import { Card } from "@/components/dash/Stat";
import { createCampaign } from "./campaign-actions";

const PERIODS: [string, string][] = [["30", "Last 30 days"], ["90", "Last 90 days"], ["365", "Last 12 months"], ["all", "All time"]];
const ratio = (r: Row) => (r.ltv != null && r.cac ? r.ltv / r.cac : null);
const x = (v: number | null) => (v == null ? "–" : `${v.toFixed(1)}×`);

export function Tile({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "good" | "bad" }) {
  return (
    <div className="rounded-xl border border-line bg-white p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${tone === "good" ? "text-success" : tone === "bad" ? "text-danger" : ""}`}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function Table({ rows, first }: { rows: Row[]; first: string }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[900px] text-left text-sm">
        <thead className="text-xs uppercase tracking-wide text-muted">
          <tr>
            <th className="py-2 pr-3">{first}</th><th className="pr-3 text-right">Spend</th><th className="pr-3 text-right">Clicks</th><th className="pr-3 text-right">Sign-ups</th>
            <th className="pr-3 text-right">New customers</th><th className="pr-3 text-right">CAC</th><th className="pr-3 text-right">Revenue</th><th className="pr-3 text-right">LTV</th>
            <th className="pr-3 text-right">LTV:CAC</th><th className="pr-3 text-right">Inst. leads</th><th className="pr-3 text-right">Return on spend</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line tabular-nums">
          {rows.map((r) => {
            const lr = ratio(r);
            return (
              <tr key={r.key}>
                <td className="py-2 pr-3">{r.campaign ? <Link href={`/admin/marketing/campaigns/${r.key}`} className="font-semibold hover:underline">{r.label}</Link> : <span className="font-semibold">{r.label}</span>}
                  {r.campaign && <span className="block text-xs text-muted">{channelLabel(r.campaign.channel)} · {stageName(r.campaign.stage)}</span>}</td>
                <td className="pr-3 text-right">{fmtUsd(r.spend)}</td><td className="pr-3 text-right">{r.clicks}</td><td className="pr-3 text-right">{r.signups}</td>
                <td className="pr-3 text-right">{r.customers}</td><td className="pr-3 text-right">{fmtUsd(r.cac)}</td><td className="pr-3 text-right">{fmtUsd(r.revenue)}</td>
                <td className="pr-3 text-right">{fmtUsd(r.ltv)}</td>
                <td className={`pr-3 text-right ${lr == null ? "" : lr >= 3 ? "text-success" : lr < 1 ? "text-danger" : ""}`}>{x(lr)}</td>
                <td className="pr-3 text-right">{r.leads}</td><td className="pr-3 text-right">{x(r.roas)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export async function OverviewTab({ period }: { period: string }) {
  const p = PERIODS.some(([v]) => v === period) ? period : "90";
  const from = p === "all" ? "1970-01-01T00:00:00Z" : daysAgoIso(Number(p));
  const [r, todos] = await Promise.all([marketingReport(from, nowIso()), processTodos()]);
  const t = r.total;
  const lr = ratio(t);
  const activeCampaigns = r.campaignRows.filter((c) => c.campaign && (c.spend || c.clicks || c.signups || c.customers || c.leads || ["live", "review"].includes(c.campaign.stage)));
  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap gap-2 text-sm">
        {PERIODS.map(([v, l]) => <Link key={v} href={`/admin/marketing?tab=overview&p=${v}`} className={`rounded-full border px-3 py-1 ${v === p ? "border-ink bg-ink text-white" : "border-line bg-white"}`}>{l}</Link>)}
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label="Marketing spend" value={fmtUsd(t.spend)} hint="Logged on campaigns" />
        <Tile label="New customers" value={String(t.customers)} hint={`${t.signups} new sign-ups`} />
        <Tile label="CAC (blended)" value={fmtUsd(t.cac)} hint="Spend ÷ new customers" />
        <Tile label="Net revenue" value={fmtUsd(t.revenue)} hint="After tax and refunds" />
        <Tile label="LTV (to date)" value={fmtUsd(t.ltv)} hint={`Average over ${r.customersAllTime} customers`} />
        <Tile label="LTV : CAC" value={x(lr)} hint="3× or more is healthy" tone={lr == null ? undefined : lr >= 3 ? "good" : lr < 1 ? "bad" : undefined} />
        <Tile label="Cost per sign-up" value={fmtUsd(t.spend && t.signups ? t.spend / t.signups : null, 2)} />
        <Tile label="Institution leads" value={String(t.leads)} hint={`${fmtUsd(t.pipeline)} open · ${fmtUsd(t.won)} won`} />
      </div>

      <Card title={`Process: ${todos.length ? `${todos.length} thing${todos.length === 1 ? "" : "s"} to do` : "all up to date"}`}>
        {todos.length ? (
          <ul className="grid gap-2 text-sm">
            {todos.map((d, i) => <li key={i}><Link href={`/admin/marketing/campaigns/${d.campaignId}`} className="font-semibold hover:underline">{d.name}</Link> · {d.text}</li>)}
          </ul>
        ) : <p className="text-sm text-muted">Every live campaign has this week&apos;s check-in and spend.</p>}
      </Card>

      <Card title="By channel"><Table rows={r.channelRows.filter((c) => c.spend || c.signups || c.customers || c.revenue || c.leads)} first="Channel" /></Card>
      <Card title="By campaign">
        {activeCampaigns.length ? <Table rows={activeCampaigns} first="Campaign" /> : <p className="text-sm text-muted">No campaign activity in this period. Create one in the Campaigns tab.</p>}
      </Card>

      <Card title="Customer cohorts (average net revenue per customer, cumulative)">
        {r.cohortRows.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm tabular-nums">
              <thead className="text-xs uppercase tracking-wide text-muted"><tr><th className="py-2 pr-3">First purchase</th><th className="pr-3 text-right">Customers</th>{["Month 0", "Month 1", "Month 3", "Month 6", "Month 12"].map((h) => <th key={h} className="pr-3 text-right">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-line">
                {r.cohortRows.map((c) => <tr key={c.month}><td className="py-2 pr-3">{c.month}</td><td className="pr-3 text-right">{c.customers}</td>{c.values.map((v, i) => <td key={i} className="pr-3 text-right">{v == null ? "" : fmtUsd(v)}</td>)}</tr>)}
              </tbody>
            </table>
          </div>
        ) : <p className="text-sm text-muted">No paying customers yet.</p>}
        <p className="mt-2 text-xs text-muted">Read across a row to see how much a group of customers spends over time: the basis of LTV. A rising row means repeat purchases.</p>
      </Card>

      <details className="rounded-xl border border-line bg-white p-4 text-sm">
        <summary className="cursor-pointer font-semibold">How these numbers are worked out</summary>
        <ul className="mt-3 grid list-disc gap-1 pl-5 text-muted">
          <li><b>Spend</b>: what you log on each campaign (Campaigns → a campaign → Spend). Staff time isn&apos;t included.</li>
          <li><b>New customer</b>: someone whose first paid order falls in the period. They are credited to the campaign that first brought them to the site (its tracked link or utm_campaign code), else to the campaign of their first order.</li>
          <li><b>Revenue</b>: paid orders after tax and refunds, credited to the latest campaign the buyer came through in the 30 days before buying.</li>
          <li><b>CAC</b>: spend ÷ new customers. <b>LTV</b>: net revenue per customer to date (what they have actually paid, not a forecast). <b>LTV:CAC</b> of 3× or more is a common sign of healthy marketing.</li>
          <li><b>Return on spend</b>: (revenue + won institution deals) ÷ spend.</li>
          <li>Amounts in other currencies are converted to US dollars with the rates in Settings. People who block cookies or arrive without a tracked link count as Direct / unknown.</li>
        </ul>
      </details>
    </div>
  );
}

export async function CampaignsTab() {
  const { data } = await createAdminClient().from("campaigns").select("id, name, channel, stage, starts_on, ends_on, objective").order("created_at", { ascending: false });
  const list = data ?? [];
  return (
    <div className="grid gap-6">
      <Card title="The campaign process">
        <ol className="grid gap-3 text-sm md:grid-cols-5">
          {STAGES.map(([v, l, d], i) => (
            <li key={v} className="rounded-lg bg-surface p-3"><p className="font-semibold">{i + 1}. {l} <span className="font-normal text-muted">({list.filter((c) => c.stage === v).length})</span></p><p className="mt-1 text-muted">{d}</p></li>
          ))}
        </ol>
      </Card>

      <Card title={`Campaigns (${list.length})`}>
        {list.length ? (
          <ul className="divide-y divide-line text-sm">
            {list.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <Link href={`/admin/marketing/campaigns/${c.id}`} className="font-semibold hover:underline">{c.name}</Link>
                <span className="text-muted">{channelLabel(c.channel)} · {c.starts_on ? `${formatDate(c.starts_on)} – ${c.ends_on ? formatDate(c.ends_on) : "open"}` : "dates not set"} · <b className="text-ink">{stageName(c.stage)}</b></span>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-muted">No campaigns yet. Plan the first one below.</p>}
      </Card>

      <Card title="Plan a new campaign">
        <form action={createCampaign} className="grid gap-3 text-sm sm:grid-cols-2">
          <label className="grid gap-1 sm:col-span-2">Name<input name="name" required placeholder="e.g. CMT Level II launch: LinkedIn, US + UAE" className="fc-input" /></label>
          <label className="grid gap-1">Channel<select name="channel" className="fc-input">{CHANNELS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
          <label className="grid gap-1">Goal<select name="objective" className="fc-input">
            <option value="sales">Sell courses</option><option value="signups">Get sign-ups</option><option value="institution_leads">Get institution enquiries</option>
            <option value="instructors">Recruit instructors</option><option value="awareness">Build awareness</option></select></label>
          <p className="text-xs text-muted sm:col-span-2">You&apos;ll fill in the rest of the brief (audience, offer, landing page, target, budget, dates) on the next screen.</p>
          <button className="fc-btn fc-btn-dark justify-self-start !min-w-0 !px-5 !py-2">Create and write the brief</button>
        </form>
      </Card>
    </div>
  );
}
