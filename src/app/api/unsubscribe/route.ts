import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyUnsubscribe } from "@/lib/email/unsubscribe";

/** One-click unsubscribe (RFC 8058) used by Gmail/Outlook's "Unsubscribe" button via the List-Unsubscribe header. */
export async function POST(request: NextRequest) {
  const u = request.nextUrl.searchParams.get("u") ?? "", t = request.nextUrl.searchParams.get("t") ?? "";
  if (!verifyUnsubscribe(u, t)) return NextResponse.json({ error: "invalid" }, { status: 400 });
  await createAdminClient().from("profiles").update({ marketing_opt_in: false }).eq("id", u);
  return NextResponse.json({ ok: true });
}
