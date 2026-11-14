import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { encodeTouch } from "@/lib/attribution";
import { env } from "@/lib/env";

/**
 * Tracked campaign link: fincoursa.com/go/<code>(?v=<variant>). Counts the click, remembers the campaign
 * for attribution, then sends the visitor to the campaign's landing page with UTM tags.
 */
export async function GET(request: NextRequest, ctx: RouteContext<"/go/[code]">) {
  const { code } = await ctx.params;
  const site = env.siteUrl.replace(/\/$/, "");
  if (!/^[a-z0-9-]{3,60}$/.test(code)) return NextResponse.redirect(site);
  const db = createAdminClient();
  const { data: c } = await db.from("campaigns").select("id, channel, landing_url").eq("code", code).maybeSingle();
  if (!c) return NextResponse.redirect(site);
  const variant = (request.nextUrl.searchParams.get("v") ?? "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 30) || null;
  // link previews (LinkedIn fetches the link when a post is written) are not people: don't count them
  const bot = /bot|crawl|spider|preview|facebookexternalhit|slurp|embedly|whatsapp|slack|telegram/i.test(request.headers.get("user-agent") ?? "");
  if (!bot) await db.from("campaign_clicks").insert({
    campaign_id: c.id, variant, country: request.headers.get("x-vercel-ip-country"), referrer: (request.headers.get("referer") ?? "").slice(0, 300) || null,
  });
  let dest: URL;
  try { dest = new URL(c.landing_url || "/", site); } catch { dest = new URL("/", site); }
  if (new URL(site).host !== dest.host) dest = new URL("/", site); // only ever send people to our own site
  dest.searchParams.set("utm_source", c.channel.startsWith("linkedin") ? "linkedin" : c.channel);
  dest.searchParams.set("utm_medium", c.channel);
  dest.searchParams.set("utm_campaign", code);
  if (variant) dest.searchParams.set("utm_content", variant);
  const res = NextResponse.redirect(dest);
  if (bot) return res;
  const touch = encodeTouch({ c: code, v: variant ?? undefined, s: c.channel, m: c.channel, l: dest.pathname, t: Date.now() });
  const opts = { sameSite: "lax" as const, httpOnly: true, secure: true, path: "/" };
  res.cookies.set("fc_touch", touch, { ...opts, maxAge: 30 * 86400 });
  if (!request.cookies.get("fc_first")) res.cookies.set("fc_first", touch, { ...opts, maxAge: 365 * 86400 });
  return res;
}
