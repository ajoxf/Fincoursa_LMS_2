import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

const REF_COOKIE = "fc_ref";
const VISITOR_COOKIE = "fc_vid";
const CAMPAIGN_COOKIE = "fc_campaign";

/**
 * 1. Refreshes the Supabase session cookie on every request.
 * 2. Affiliate tracking: ?ref=CODE stores the code in a first-party cookie and records a click.
 */
// Marketing attribution (see src/lib/attribution.ts): ?utm_campaign=<code> (or ?c=<code>) on any page is remembered.
function rememberTouch(request: NextRequest, response: NextResponse) {
  const sp = request.nextUrl.searchParams;
  const code = (sp.get("c") ?? sp.get("utm_campaign") ?? "").toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 60);
  const source = (sp.get("utm_source") ?? "").slice(0, 40);
  if (!code && !source) return;
  const touch = encodeURIComponent(JSON.stringify({ c: code || undefined, s: source || undefined, m: (sp.get("utm_medium") ?? "").slice(0, 40) || undefined, l: request.nextUrl.pathname.slice(0, 120), t: Date.now() }));
  const opts = { sameSite: "lax" as const, httpOnly: true, secure: true, path: "/" };
  response.cookies.set("fc_touch", touch, { ...opts, maxAge: 30 * 86400 });
  if (!request.cookies.get("fc_first")) response.cookies.set("fc_first", touch, { ...opts, maxAge: 365 * 86400 });
}

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (url && key) {
    const supabase = createServerClient(url, key, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (toSet) => {
          toSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    });
    await supabase.auth.getUser();

    const ref = request.nextUrl.searchParams.get("ref");
    if (ref && /^[A-Za-z0-9_-]{2,40}$/.test(ref)) {
      const visitor = request.cookies.get(VISITOR_COOKIE)?.value ?? crypto.randomUUID();
      const sp = request.nextUrl.searchParams;
      const campaign = (sp.get("sub") ?? sp.get("utm_campaign") ?? "").replace(/[^A-Za-z0-9_-]/g, "").toLowerCase().slice(0, 60);
      // Record the click; the RPC returns the affiliate id only for approved codes.
      const res = await fetch(`${url}/rest/v1/rpc/track_affiliate_click`, {
        method: "POST",
        headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          p_code: ref, p_visitor: visitor, p_path: request.nextUrl.pathname,
          p_referrer: request.headers.get("referer") ?? "", p_country: request.headers.get("x-vercel-ip-country") ?? "",
          p_campaign: campaign || null,
        }),
      }).catch(() => null);
      const affiliateId = res?.ok ? await res.json().catch(() => null) : null;
      if (affiliateId) {
        const days = Number(process.env.AFFILIATE_COOKIE_DAYS ?? 30);
        response.cookies.set(REF_COOKIE, ref, { maxAge: days * 86400, sameSite: "lax", httpOnly: true, secure: true, path: "/" });
        response.cookies.set(VISITOR_COOKIE, visitor, { maxAge: 365 * 86400, sameSite: "lax", httpOnly: true, secure: true, path: "/" });
        if (campaign) response.cookies.set(CAMPAIGN_COOKIE, campaign, { maxAge: days * 86400, sameSite: "lax", httpOnly: true, secure: true, path: "/" });
        else response.cookies.delete(CAMPAIGN_COOKIE);
      }
    }
  }
  rememberTouch(request, response);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/webhooks|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
