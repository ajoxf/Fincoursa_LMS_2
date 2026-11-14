"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { setSetting } from "@/lib/site-settings";
import { minorUnitsFactor } from "@/lib/money";
import { CHANNELS, REPORT_DEFAULTS } from "@/lib/marketing-metrics";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const go = (path: string, k: "ok" | "err", msg: string): never => redirect(`${path}${path.includes("?") ? "&" : "?"}${k}=${encodeURIComponent(msg)}`);
const staff = () => requireRole(["admin", "support", "finance"]);
const page = (id: string) => `/admin/marketing/campaigns/${id}`;
const OBJECTIVES = ["sales", "signups", "institution_leads", "instructors", "awareness"];
const TARGETS = ["customers", "signups", "leads", "revenue", "clicks"];
const day = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

function slug(s: string) {
  return s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) || "campaign";
}

function brief(f: FormData) {
  const currency = /^[A-Z]{3}$/.test(str(f, "currency").toUpperCase()) ? str(f, "currency").toUpperCase() : "USD";
  const budget = Number(str(f, "budget"));
  return {
    name: str(f, "name").slice(0, 120) || undefined,
    channel: CHANNELS.some(([v]) => v === str(f, "channel")) ? str(f, "channel") : undefined,
    objective: OBJECTIVES.includes(str(f, "objective")) ? str(f, "objective") : undefined,
    audience: str(f, "audience").slice(0, 2000) || null, offer: str(f, "offer").slice(0, 2000) || null,
    hypothesis: str(f, "hypothesis").slice(0, 2000) || null, landing_url: str(f, "landing_url").slice(0, 500) || null,
    target_metric: TARGETS.includes(str(f, "target_metric")) ? str(f, "target_metric") : null,
    target_value: Number(str(f, "target_value")) > 0 ? Number(str(f, "target_value")) : null,
    budget_minor: budget > 0 ? Math.round(budget * minorUnitsFactor(currency)) : null, currency,
    starts_on: day(str(f, "starts_on")), ends_on: day(str(f, "ends_on")),
  };
}

/** Plan a new campaign (step 1 of the process). */
export async function createCampaign(form: FormData) {
  const me = await staff();
  const b = brief(form);
  if (!b.name) go("/admin/marketing?tab=campaigns", "err", "Give the campaign a name.");
  const db = createAdminClient();
  let code = slug(str(form, "code") || b.name!);
  for (let i = 2; (await db.from("campaigns").select("id").eq("code", code).maybeSingle()).data; i++) code = `${slug(b.name!).slice(0, 46)}-${i}`;
  const { data, error } = await db.from("campaigns").insert({ ...b, code, owner_id: me.id, stage: "plan" }).select("id").single();
  if (error || !data) go("/admin/marketing?tab=campaigns", "err", error?.message ?? "Could not create it.");
  revalidatePath("/admin/marketing");
  redirect(page(data!.id));
}

export async function updateCampaign(id: string, form: FormData) {
  await staff();
  const b = brief(form);
  const fields = { ...b, result_summary: str(form, "result_summary").slice(0, 4000) || undefined, learnings: str(form, "learnings").slice(0, 4000) || undefined,
    decision: ["scale", "iterate", "stop"].includes(str(form, "decision")) ? str(form, "decision") : undefined, updated_at: new Date().toISOString() };
  const { error } = await createAdminClient().from("campaigns").update(fields).eq("id", id);
  revalidatePath("/admin/marketing");
  go(page(id), error ? "err" : "ok", error ? error.message : "Saved.");
}

/** What's missing before a campaign can move to the next stage. */
export async function missingFor(c: Record<string, unknown>, to: string, checks: number): Promise<string[]> {
  const need: string[] = [];
  if (to === "approved") {
    if (!c.audience) need.push("who it's for (audience)");
    if (!c.offer) need.push("the offer or message");
    if (!c.landing_url) need.push("the landing page");
    if (!c.target_metric || !c.target_value) need.push("a target (e.g. 10 customers)");
    if (c.budget_minor == null) need.push("a budget (0 is fine for free channels)");
    if (!c.starts_on || !c.ends_on) need.push("start and end dates");
  }
  if (to === "review" && checks === 0) need.push("at least one weekly check-in");
  if (to === "done") {
    if (!c.result_summary) need.push("the result summary");
    if (!c.learnings) need.push("what you learned");
    if (!c.decision) need.push("the decision (scale, iterate or stop)");
  }
  return need;
}

const NEXT: Record<string, string[]> = { plan: ["approved"], approved: ["live", "plan"], live: ["review"], review: ["done", "live"], done: [], stopped: ["plan"] };

/** Move a campaign along the process. Approval is for admins only. */
export async function moveCampaign(id: string, to: string) {
  const me = await staff();
  const db = createAdminClient();
  const [{ data: c }, { count }] = await Promise.all([
    db.from("campaigns").select("*").eq("id", id).maybeSingle(),
    db.from("campaign_checks").select("id", { count: "exact", head: true }).eq("campaign_id", id),
  ]);
  if (!c) go("/admin/marketing?tab=campaigns", "err", "Campaign not found.");
  if (to !== "stopped" && !NEXT[c!.stage]?.includes(to)) go(page(id), "err", "That step isn't possible from here.");
  if (to === "approved" && !me.roles.includes("admin")) go(page(id), "err", "Only an admin can approve a campaign.");
  const missing = await missingFor(c!, to, count ?? 0);
  if (missing.length) go(page(id), "err", `Before this step, add: ${missing.join(", ")}.`);
  const patch: Record<string, unknown> = { stage: to, updated_at: new Date().toISOString() };
  if (to === "approved") { patch.approved_by = me.id; patch.approved_at = new Date().toISOString(); }
  await db.from("campaigns").update(patch).eq("id", id);
  revalidatePath("/admin/marketing");
  go(page(id), "ok", { approved: "Approved. Set it live when it starts.", live: "Live. Share the tracked link and log spend weekly.", review: "In review: compare the results with the target.", done: "Done. The learnings are saved.", stopped: "Stopped.", plan: "Back to planning." }[to] ?? "Updated.");
}

export async function addCost(id: string, form: FormData) {
  const me = await staff();
  const currency = /^[A-Z]{3}$/.test(str(form, "currency").toUpperCase()) ? str(form, "currency").toUpperCase() : "USD";
  const amount = Number(str(form, "amount"));
  const on = day(str(form, "spent_on"));
  if (!(amount > 0) || !on) go(page(id), "err", "Enter the amount and the date.");
  await createAdminClient().from("campaign_costs").insert({
    campaign_id: id, spent_on: on, amount_minor: Math.round(amount * minorUnitsFactor(currency)), currency, note: str(form, "note").slice(0, 300) || null, created_by: me.id,
  });
  revalidatePath("/admin/marketing");
  go(page(id), "ok", "Spend added.");
}

export async function deleteCost(campaignId: string, costId: string) {
  await staff();
  await createAdminClient().from("campaign_costs").delete().eq("id", costId).eq("campaign_id", campaignId);
  revalidatePath("/admin/marketing");
  go(page(campaignId), "ok", "Removed.");
}

/** The weekly check-in while a campaign is live. */
export async function addCheck(id: string, form: FormData) {
  const me = await staff();
  const note = str(form, "note").slice(0, 2000);
  if (!note) go(page(id), "err", "Write a line on how it's going and what you'll change.");
  await createAdminClient().from("campaign_checks").insert({ campaign_id: id, on_track: form.get("on_track") === "yes", note, created_by: me.id });
  revalidatePath("/admin/marketing");
  go(page(id), "ok", "Check-in saved.");
}

export async function saveReportSettings(form: FormData) {
  const admin = await requireRole(["admin"]);
  const fx: Record<string, number> = { USD: 1 };
  for (const c of Object.keys(REPORT_DEFAULTS.fx)) {
    if (c === "USD") continue;
    const v = Number(str(form, `fx_${c}`));
    fx[c] = v > 0 ? v : REPORT_DEFAULTS.fx[c];
  }
  await setSetting("marketing_report", { fx }, admin.id);
  revalidatePath("/admin/marketing");
  go("/admin/marketing?tab=settings", "ok", "Exchange rates saved.");
}
