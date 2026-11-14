import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/** The campaign process: plan → approved → live → review → done. */
export const STAGES: [string, string, string][] = [
  ["plan", "Plan", "Write the brief: who it's for, the offer, the landing page, a target and a budget."],
  ["approved", "Approved", "An admin checks the brief and approves the budget."],
  ["live", "Live", "Share the tracked link, log spend and do a weekly check-in."],
  ["review", "Review", "After it ends, compare the results with the target."],
  ["done", "Done", "Record what you learned and decide: scale, iterate or stop."],
];
export const stageName = (s: string) => (s === "stopped" ? "Stopped" : STAGES.find(([v]) => v === s)?.[1] ?? s);
const PAID = new Set(["linkedin_ads", "event", "search", "partner"]);

export type Todo = { campaignId: string; name: string; text: string };

/** What the process needs from someone right now. */
export async function processTodos(now = new Date()): Promise<Todo[]> {
  const db = createAdminClient();
  const today = now.toISOString().slice(0, 10);
  const weekAgo = new Date(now.getTime() - 7 * 86400_000).toISOString();
  const [{ data: cs }, { data: checks }, { data: costs }] = await Promise.all([
    db.from("campaigns").select("id, name, stage, channel, starts_on, ends_on").in("stage", ["plan", "approved", "live", "review"]),
    db.from("campaign_checks").select("campaign_id, created_at").gte("created_at", weekAgo),
    db.from("campaign_costs").select("campaign_id, created_at").gte("created_at", weekAgo),
  ]);
  const checked = new Set((checks ?? []).map((c) => c.campaign_id));
  const spent = new Set((costs ?? []).map((c) => c.campaign_id));
  const out: Todo[] = [];
  for (const c of cs ?? []) {
    const t = (text: string) => out.push({ campaignId: c.id, name: c.name, text });
    if (c.stage === "approved" && c.starts_on && c.starts_on <= today) t("Start date reached: set it live.");
    if (c.stage === "live") {
      if (c.ends_on && c.ends_on < today) t("End date passed: move it to review.");
      if (!checked.has(c.id)) t("No check-in this week: add one.");
      if (PAID.has(c.channel) && !spent.has(c.id)) t("No spend logged this week: add this week's spend.");
    }
    if (c.stage === "review") t("Waiting for review: write the result, learnings and decision.");
    if (c.stage === "plan" && c.starts_on && c.starts_on <= today) t("Start date reached but not approved yet.");
  }
  return out;
}

/** Monday morning: last week's numbers and the process to-dos, emailed to the team. */
export async function sendWeeklyReview(now = new Date()) {
  if (now.getUTCDay() !== 1) return false;
  const { marketingReport, fmtUsd } = await import("@/lib/marketing-metrics");
  const { getGrowthSettings } = await import("@/lib/growth");
  const { automationEmail } = await import("@/lib/email/templates");
  const { sendEmail } = await import("@/lib/email/send");
  const { env } = await import("@/lib/env");
  const from = new Date(now.getTime() - 7 * 86400_000).toISOString();
  const [r, todos, s] = await Promise.all([marketingReport(from, now.toISOString()), processTodos(now), getGrowthSettings()]);
  const t = r.total;
  const lines = [
    `- Spend: ${fmtUsd(t.spend)}`, `- Sign-ups: ${t.signups}`, `- New customers: ${t.customers}`, `- CAC: ${fmtUsd(t.cac)}`,
    `- Net revenue: ${fmtUsd(t.revenue)}`, `- Institution leads: ${t.leads} (open pipeline ${fmtUsd(t.pipeline)})`,
  ].join("\n");
  const top = r.campaignRows.filter((c) => c.campaign && (c.customers || c.signups || c.leads)).sort((a, b) => b.revenue - a.revenue).slice(0, 3)
    .map((c) => `- ${c.label}: ${c.signups} sign-ups, ${c.customers} customers, ${fmtUsd(c.revenue)}`).join("\n");
  const body = `Here is last week's marketing.\n\n${lines}${top ? `\n\nBest campaigns:\n\n${top}` : ""}\n\n${todos.length ? `To do this week:\n\n${todos.map((d) => `- ${d.name}: ${d.text}`).join("\n")}` : "Every live campaign is up to date."}`;
  const e = automationEmail({ subject: `Weekly marketing review: ${t.customers} new customers, CAC ${fmtUsd(t.cac)}`, body, cta: { label: "Open Marketing", url: `${env.siteUrl.replace(/\/$/, "")}/admin/marketing` } });
  return sendEmail({ ...e, to: s.team_email, template: "weekly_marketing", ref: now.toISOString().slice(0, 10) });
}
