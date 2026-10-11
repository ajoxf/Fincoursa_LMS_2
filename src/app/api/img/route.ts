import { NextResponse, type NextRequest } from "next/server";

// Images still hosted on Thinkific's CDN, fetched server-side (with fincoursa.com as the referrer)
// and cached by Vercel's edge for a year. Only Thinkific hosts are allowed: not an open proxy.
const ALLOWED = /^https:\/\/([a-z0-9-]+\.)*thinkific\.com\//i;
const TYPES = /^image\/(png|jpe?g|webp|gif|svg\+xml|avif)$/;

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("u") ?? "";
  if (!ALLOWED.test(url)) return NextResponse.json({ error: "not allowed" }, { status: 400 });
  const upstream = await fetch(url, {
    headers: { Referer: "https://fincoursa.com/", "User-Agent": "Mozilla/5.0 (FinCoursa image migration)", Accept: "image/*" },
    cache: "force-cache",
  }).catch(() => null);
  const type = (upstream?.headers.get("content-type") ?? "").split(";")[0].trim();
  if (!upstream?.ok || !TYPES.test(type)) {
    return NextResponse.json({ error: "image unavailable", status: upstream?.status ?? 0 }, { status: 502, headers: { "Cache-Control": "public, max-age=60" } });
  }
  return new NextResponse(upstream.body, {
    headers: {
      "Content-Type": type,
      "Cache-Control": "public, max-age=31536000, s-maxage=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      ...(type === "image/svg+xml" ? { "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'" } : {}),
    },
  });
}
