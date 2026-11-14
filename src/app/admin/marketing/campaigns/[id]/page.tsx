import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { env } from "@/lib/env";
import { formatDate } from "@/lib/format";
import { formatMoney, minorUnitsFactor } from "@/lib/money";
import { campaignLifetime, CHANNELS, fmtUsd } from "@/lib/marketing-metrics";
import { STAGES } from "@/lib/campaign-process";
import { Card } from "@/components/dash/Stat";
import { addCheck, addCost, deleteCost, moveCampaign, updateCampaign } from "../../campaign-actions";

export const metadata: Metadata = { title: "Campaign" };

const TARGET: Record<string, string> = { customers: "new customers", signups: "sign-ups", leads: "institution leads", revenue: "revenue (US$)", clicks: "clicks" };
const NEXT_STEP: Record<string, [string, string][]> = {
  plan: [["approved", "Approve the brief"]], approved: [["live", "Set live"], ["plan", "Back to planning"]],
  live: [["review", "Move to review"]], review: [["done", "Mark as done"], ["live", "Back to live"]], done: [], stopped: [["plan", "Re-plan"]],
};

export default async function CampaignPage({ params, searchParams }: PageProps<"/admin/marketing/campaigns/[id]">) {
  await requireRole(["admin", "support", "finance"], "/admin/marketing");
  const { id } = await params;
  const sp = await searchParams;
  const db = createAdminClient();
  const [{ data: c }, { data: costs }, { data: checks }, r] = await Promise.all([
    db.from("campaigns").select("*").eq("id", id).maybeSingle(),
    db.from("campaign_costs").select("id, spent_on, amount_minor, currency, note").eq("campaign_id", id).order("spent_on", { ascending: false }),
    db.from("campaign_checks").select("id, on_track, note, created_at").eq("campaign_id", id).order("created_at", { ascending: false }),
    campaignLifetime(id),
  ]);
  if (!c) notFound();
  const site = env.siteUrl.replace(/\/$/, "");
  const goLink = `${site}/go/${c.code}`;
  const landing = (() => { try { return new URL(c.landing_url || "/", site); } catch { return new URL("/", site); } })();
  landing.searchParams.set("utm_source", c.channel.startsWith("linkedin") ? "linkedin" : c.channel);
  landing.searchParams.set("utm_medium", c.channel);
  landing.searchParams.set("utm_campaign", c.code);
  const actual = r ? ({ customers: r.customers, signups: r.signups, leads: r.leads, revenue: r.revenue, clicks: r.clicks } as Record<string, number>)[c.target_metric ?? ""] : null;
  const stageIdx = STAGES.findIndex(([v]) => v === c.stage);
  const f = "fc-input !py-1.5";
  const cur = c.currency ?? "USD";

  return (
    <div className="grid gap-6">
      <div className="grid gap-2">
        <Link href="/admin/marketing?tab=campaigns" className="text-sm underline">← Campaigns</Link>
        <h1 className="text-3xl font-bold text-primary">{c.name}</h1>
        <p className="text-sm text-muted">{CHANNELS.find(([v]) => v === c.channel)?.[1]} · code <code>{c.code}</code>{c.approved_at ? ` · approved ${formatDate(c.approved_at)}` : ""}</p>
      </div>
      {typeof sp.ok === "string" && <p className="rounded-lg bg-success/10 p-3 text-sm text-success">{sp.ok}</p>}
      {typeof sp.err === "string" && <p className="rounded-lg bg-danger/10 p-3 text-sm text-danger">{sp.err}</p>}

      {/* where it is in the process, and the next step */}
      <div className="grid gap-3 rounded-xl border border-line bg-white p-4">
        <ol className="grid grid-cols-5 gap-2 text-xs">
          {STAGES.map(([v, l], i) => (
            <li key={v} className={`rounded-md px-2 py-1.5 text-center font-semibold ${c.stage === "stopped" ? "bg-surface text-muted" : i < stageIdx ? "bg-success/15 text-success" : i === stageIdx ? "bg-ink text-white" : "bg-surface text-muted"}`}>{i + 1}. {l}</li>
          ))}
        </ol>
        <p className="text-sm">{c.stage === "stopped" ? "Stopped." : STAGES[stageIdx]?.[2]}</p>
        <form className="flex flex-wrap gap-3">
          {NEXT_STEP[c.stage]?.map(([to, label], i) => (
            <button key={to} formAction={moveCampaign.bind(null, id, to)} className={i === 0 ? "fc-btn fc-btn-primary !min-w-0 !px-4 !py-1.5" : "text-sm underline"}>{label}</button>
          ))}
          {!["done", "stopped"].includes(c.stage) && <button formAction={moveCampaign.bind(null, id, "stopped")} className="ml-auto text-sm text-muted underline">Stop campaign</button>}
        </form>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="grid content-start gap-6">
          <Card title="Results so far (whole campaign)">
            <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              {[["Spend", fmtUsd(r?.spend)], ["Clicks", String(r?.clicks ?? 0)], ["Sign-ups", String(r?.signups ?? 0)], ["New customers", String(r?.customers ?? 0)],
                ["CAC", fmtUsd(r?.cac)], ["Revenue", fmtUsd(r?.revenue)], ["Institution leads", String(r?.leads ?? 0)], ["Return on spend", r?.roas != null ? `${r.roas.toFixed(1)}×` : "–"]].map(([k, v]) => (
                <div key={k} className="rounded-lg bg-surface p-3"><p className="text-xs text-muted">{k}</p><p className="text-lg font-bold tabular-nums">{v}</p></div>
              ))}
            </div>
            {c.target_metric && c.target_value ? (
              <p className="mt-3 text-sm">Target: <b>{Number(c.target_value).toLocaleString()} {TARGET[c.target_metric]}</b> · so far <b>{c.target_metric === "revenue" ? fmtUsd(actual) : actual ?? 0}</b>
                {" "}({Math.round(((actual ?? 0) / Number(c.target_value)) * 100)}%)</p>
            ) : <p className="mt-3 text-sm text-muted">Set a target in the brief to track progress.</p>}
            {c.budget_minor != null && <p className="text-sm text-muted">Budget {formatMoney(c.budget_minor, cur)} · spent {formatMoney((costs ?? []).filter((k) => k.currency === cur).reduce((a, k) => a + Number(k.amount_minor), 0), cur)}</p>}
          </Card>

          <Card title="The brief">
            <form action={updateCampaign.bind(null, id)} className="grid gap-3 text-sm sm:grid-cols-2">
              <label className="grid gap-1 sm:col-span-2">Name<input name="name" defaultValue={c.name} className={f} /></label>
              <label className="grid gap-1">Channel<select name="channel" defaultValue={c.channel} className={f}>{CHANNELS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
              <label className="grid gap-1">Goal<select name="objective" defaultValue={c.objective} className={f}>
                <option value="sales">Sell courses</option><option value="signups">Get sign-ups</option><option value="institution_leads">Get institution enquiries</option>
                <option value="instructors">Recruit instructors</option><option value="awareness">Build awareness</option></select></label>
              <label className="grid gap-1 sm:col-span-2">Who it&apos;s for (audience)<textarea name="audience" rows={2} defaultValue={c.audience ?? ""} placeholder="e.g. CMT Level II candidates in the US and UAE; analysts and traders" className="fc-input" /></label>
              <label className="grid gap-1 sm:col-span-2">The offer or message<textarea name="offer" rows={2} defaultValue={c.offer ?? ""} placeholder="e.g. Launch offer: full fee back as credit, founding member pricing until 16 Dec" className="fc-input" /></label>
              <label className="grid gap-1 sm:col-span-2">Why we think it will work (hypothesis)<textarea name="hypothesis" rows={2} defaultValue={c.hypothesis ?? ""} className="fc-input" /></label>
              <label className="grid gap-1 sm:col-span-2">Landing page<input name="landing_url" defaultValue={c.landing_url ?? ""} placeholder="/courses/cmtl2-qbank" className={f} /></label>
              <label className="grid gap-1">Target<select name="target_metric" defaultValue={c.target_metric ?? ""} className={f}><option value="">Choose…</option>{Object.entries(TARGET).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
              <label className="grid gap-1">Target number<input name="target_value" defaultValue={c.target_value ?? ""} inputMode="decimal" className={f} /></label>
              <label className="grid gap-1">Budget<input name="budget" defaultValue={c.budget_minor != null ? Number(c.budget_minor) / minorUnitsFactor(cur) : ""} inputMode="decimal" className={f} /></label>
              <label className="grid gap-1">Currency<input name="currency" defaultValue={cur} maxLength={3} className={`${f} uppercase`} /></label>
              <label className="grid gap-1">Starts<input type="date" name="starts_on" defaultValue={c.starts_on ?? ""} className={f} /></label>
              <label className="grid gap-1">Ends<input type="date" name="ends_on" defaultValue={c.ends_on ?? ""} className={f} /></label>
              {["review", "done"].includes(c.stage) && <>
                <label className="grid gap-1 sm:col-span-2">Result (what happened, against the target)<textarea name="result_summary" rows={3} defaultValue={c.result_summary ?? ""} className="fc-input" /></label>
                <label className="grid gap-1 sm:col-span-2">What we learned<textarea name="learnings" rows={3} defaultValue={c.learnings ?? ""} className="fc-input" /></label>
                <label className="grid gap-1">Decision<select name="decision" defaultValue={c.decision ?? ""} className={f}><option value="">Choose…</option><option value="scale">Scale it up</option><option value="iterate">Change and run again</option><option value="stop">Stop</option></select></label>
              </>}
              <button className="fc-btn fc-btn-dark justify-self-start !min-w-0 !px-5 !py-2 sm:col-span-2">Save</button>
            </form>
          </Card>
        </div>

        <aside className="grid content-start gap-6">
          <Card title="Tracked links">
            <div className="grid gap-3 text-sm">
              <div><p className="text-xs text-muted">Share this link (posts, emails, partners, QR codes). It counts clicks.</p><p className="break-all font-mono text-[13px]">{goLink}</p>
                <p className="mt-1 text-xs text-muted">Testing two versions? Add ?v=a or ?v=b to the end.</p></div>
              <div><p className="text-xs text-muted">For LinkedIn ads, use this as the ad&apos;s destination URL:</p><p className="break-all font-mono text-[13px]">{landing.toString()}</p></div>
            </div>
          </Card>

          <Card title="Spend">
            <form action={addCost.bind(null, id)} className="mb-3 flex flex-wrap items-end gap-2 text-sm">
              <label className="grid gap-1">Date<input type="date" name="spent_on" required className={f} /></label>
              <label className="grid gap-1">Amount<input name="amount" required inputMode="decimal" className={`${f} w-24`} /></label>
              <label className="grid gap-1">Cur.<input name="currency" defaultValue={cur} maxLength={3} className={`${f} w-16 uppercase`} /></label>
              <input name="note" placeholder="Note (e.g. LinkedIn week 1)" className={`${f} w-full`} />
              <button className="text-sm underline">Add spend</button>
            </form>
            <ul className="grid gap-1 text-sm">
              {(costs ?? []).map((k) => (
                <li key={k.id} className="flex justify-between gap-2"><span>{formatDate(k.spent_on)} · {formatMoney(k.amount_minor, k.currency)}{k.note ? ` · ${k.note}` : ""}</span>
                  <form><button formAction={deleteCost.bind(null, id, k.id)} className="text-xs text-muted underline">Remove</button></form></li>
              ))}
              {!(costs ?? []).length && <li className="text-muted">No spend logged. For LinkedIn ads, copy the weekly spend from Campaign Manager.</li>}
            </ul>
          </Card>

          <Card title="Weekly check-ins">
            {["live", "review"].includes(c.stage) && (
              <form action={addCheck.bind(null, id)} className="mb-3 grid gap-2 text-sm">
                <div className="flex gap-4"><label className="flex items-center gap-1"><input type="radio" name="on_track" value="yes" defaultChecked /> On track</label><label className="flex items-center gap-1"><input type="radio" name="on_track" value="no" /> Behind</label></div>
                <textarea name="note" rows={2} placeholder="How it's going and what you'll change this week" className="fc-input" />
                <button className="justify-self-start text-sm underline">Save check-in</button>
              </form>
            )}
            <ul className="grid gap-2 text-sm">
              {(checks ?? []).map((k) => <li key={k.id}><span className={k.on_track ? "text-success" : "text-danger"}>{k.on_track ? "On track" : "Behind"}</span> · <span className="text-muted">{formatDate(k.created_at)}</span><br />{k.note}</li>)}
              {!(checks ?? []).length && <li className="text-muted">None yet. While live, add one each week.</li>}
            </ul>
          </Card>
        </aside>
      </div>
    </div>
  );
}
