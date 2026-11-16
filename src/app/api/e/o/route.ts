import { createAdminClient } from "@/lib/supabase/admin";
import { verifyOpen } from "@/lib/email/tracking";

const GIF = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");

/** Email opened: the email loaded its 1x1 image. */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const r = q.get("r") ?? "", s = q.get("s") ?? "";
  if (verifyOpen(r, s)) {
    await createAdminClient().rpc("record_email_event", { p_recipient: Number(r), p_kind: "open", p_url: null, p_agent: req.headers.get("user-agent") ?? "" }).then(() => null, () => null);
  }
  return new Response(GIF, { headers: { "Content-Type": "image/gif", "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" } });
}
