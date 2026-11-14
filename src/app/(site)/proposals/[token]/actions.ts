"use server";
import { createAdminClient } from "@/lib/supabase/admin";
import { allow, clientIp, TOO_MANY } from "@/lib/rate-limit";
import { getGrowthSettings, logEvent } from "@/lib/growth";
import { sendEmail } from "@/lib/email/send";
import { automationEmail } from "@/lib/email/templates";
import { env } from "@/lib/env";

export type RespondState = { ok: boolean; message?: string; error?: string } | null;

/** The lead asks for the pilot or accepts the proposal: record it and alert the team. */
export async function respondToProposal(token: string, choice: "pilot" | "accept", _: RespondState, form: FormData): Promise<RespondState> {
  if (!(await allow("proposal", await clientIp(), 10, 3600))) return { ok: false, error: TOO_MANY };
  const db = createAdminClient();
  const { data: lead } = await db.from("institution_leads").select("id, organization, contact_name, stage").eq("proposal_token", token).maybeSingle();
  if (!lead) return { ok: false, error: "This proposal link is no longer valid." };
  const note = String(form.get("note") ?? "").trim().slice(0, 2000);
  const what = choice === "pilot" ? "requested the free pilot" : "accepted the proposal";
  await logEvent(lead.id, choice === "pilot" ? "pilot_requested" : "accepted", `${lead.contact_name ?? "The contact"} ${what}${note ? `: "${note}"` : ""}`);
  if (choice === "pilot" && ["new", "contacted", "proposal"].includes(lead.stage)) {
    await db.from("institution_leads").update({ stage: "pilot", updated_at: new Date().toISOString() }).eq("id", lead.id);
  }
  const s = await getGrowthSettings();
  const e = automationEmail({
    subject: `${lead.organization} ${what}`,
    body: `${lead.contact_name ?? "Your contact"} at ${lead.organization} ${what} from the proposal page.${note ? `\n\nTheir note: ${note}` : ""}\n\nPlease reply within one working day.`,
    cta: { label: "Open the lead", url: `${env.siteUrl.replace(/\/$/, "")}/admin/marketing/leads/${lead.id}` },
  });
  await sendEmail({ ...e, to: s.team_email, template: `growth_${choice}`, ref: `${lead.id}:${Date.now()}` });
  return { ok: true, message: choice === "pilot" ? "Thank you. We'll set up your pilot and email you within one working day." : "Thank you. We'll email you within one working day with the next steps and an invoice." };
}
