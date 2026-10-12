import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/**
 * Where Supabase's emails land (confirm sign-up, and sign-in / reset links while Resend isn't set up).
 * - ?token_hash=…&type=… : works on any device (used by the branded email templates)
 * - ?code=… : the default; only works in the browser that asked for it. If someone opens the link on
 *   another device, their email is still confirmed, so we send them to sign in with that message.
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const nextParam = url.searchParams.get("next") ?? "/dashboard";
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/dashboard";
  const supabase = await createClient();

  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  if (tokenHash && type && ["signup", "email", "magiclink", "recovery", "invite", "email_change"].includes(type)) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (!error) return NextResponse.redirect(new URL(type === "recovery" ? "/dashboard/settings?reset=1" : next, url.origin));
    return NextResponse.redirect(new URL("/users/sign_in?error=link", url.origin));
  }

  const code = url.searchParams.get("code");
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, url.origin));
    // opened on a different device/browser: the email itself is verified, they just need to sign in here
    if (error.code === "bad_code_verifier" || /code verifier/i.test(error.message)) {
      return NextResponse.redirect(new URL(`/users/sign_in?confirmed=1&next=${encodeURIComponent(next)}`, url.origin));
    }
  }
  // Supabase passes its own errors along (e.g. an expired link)
  return NextResponse.redirect(new URL("/users/sign_in?error=link", url.origin));
}
