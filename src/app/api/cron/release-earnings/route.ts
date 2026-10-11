import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendLiveReminders, sendMissedCompletionEmails } from "@/lib/email/events";
import { processScheduledCampaigns } from "@/lib/campaigns";

export const maxDuration = 300;

// Daily (vercel.json): earnings past the 30-day refund window become payable; live-session reminders go out.
export async function GET(request: NextRequest) {
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { error } = await createAdminClient().rpc("release_matured_earnings");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const completionEmails = await sendMissedCompletionEmails();
  const liveReminders = await sendLiveReminders();
  // scheduled newsletters/promotions whose date has come (and any send that was interrupted)
  const campaignEmails = await processScheduledCampaigns().catch((e) => { console.error("[cron] campaigns", e); return 0; });
  return NextResponse.json({ ok: true, completionEmails, liveReminders, campaignEmails });
}
