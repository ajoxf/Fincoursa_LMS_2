import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/", request.nextUrl.origin), { status: 303 });
}

/** An old link or bookmark to /auth/sign-out: a small page with a Sign out button (signing out needs a form post). */
export async function GET() {
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sign out</title></head>
<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#000;color:#fff;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
<form action="/auth/sign-out" method="post" style="text-align:center"><p style="font-size:18px;margin:0 0 16px">Sign out of FinCoursa?</p>
<button style="background:#d6fd3b;color:#0a0a0a;border:0;border-radius:999px;padding:12px 28px;font-size:16px;font-weight:700;cursor:pointer">Sign out</button>
<p style="margin:16px 0 0"><a href="/" style="color:#bbb">Back to fincoursa.com</a></p></form></body></html>`;
  return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
