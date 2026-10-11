import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendLiveReminders, sendMissedCompletionEmails } from "@/lib/email/events";

// Daily (vercel.json): earnings past the 30-day refund window become payable; live-session reminders go out.
export async function GET(request: NextRequest) {
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { error } = await createAdminClient().rpc("release_matured_earnings");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const completionEmails = await sendMissedCompletionEmails();
  const liveReminders = await sendLiveReminders();
  return NextResponse.json({ ok: true, completionEmails, liveReminders });
}
