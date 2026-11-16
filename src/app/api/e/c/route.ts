import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyClick } from "@/lib/email/tracking";
import { env } from "@/lib/env";

/** A link in an email was clicked: record it for that person, then go to the real page. */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const r = q.get("r") ?? "", u = q.get("u") ?? "", s = q.get("s") ?? "";
  if (!verifyClick(r, u, s)) return NextResponse.redirect(env.siteUrl, 302);
  await createAdminClient().rpc("record_email_event", { p_recipient: Number(r), p_kind: "click", p_url: u, p_agent: req.headers.get("user-agent") ?? "" }).then(() => null, () => null);
  return NextResponse.redirect(u, 302);
}
