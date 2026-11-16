import { NextResponse } from "next/server";
import { REFERRAL_COOKIE, REFERRAL_DAYS, referrerFor } from "@/lib/referral";
import { env } from "@/lib/env";

/** fincoursa.com/r/CODE: remember who shared the link (30 days), then show the CMT Level II Question Bank. */
export async function GET(_req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const res = NextResponse.redirect(`${env.siteUrl}/courses/cmtl2-qbank?utm_source=referral&utm_medium=friend`, 302);
  if (await referrerFor(code)) {
    res.cookies.set(REFERRAL_COOKIE, code.toUpperCase(), { maxAge: REFERRAL_DAYS * 86400, sameSite: "lax", httpOnly: true, secure: true, path: "/" });
  }
  return res;
}
