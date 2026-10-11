"use server";
import { redirect } from "next/navigation";
import { headers, cookies } from "next/headers";
import { after } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { env } from "@/lib/env";
import { allow, clientIp, LIMITS, TOO_MANY } from "@/lib/rate-limit";
import { sendPasswordReset, sendSignInLink, sendWelcome } from "@/lib/email/events";

export type AuthState = { error?: string; message?: string } | null;

const LINK_SENT = "If there's an account for that email, a sign-in link is on its way. It expires in 60 minutes.";
const hasServiceKey = () => Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);

const safeNext = (n: FormDataEntryValue | null) => {
  const s = typeof n === "string" ? n : "";
  return s.startsWith("/") && !s.startsWith("//") ? s : "/dashboard";
};

async function origin() {
  const h = await headers();
  return h.get("origin") ?? env.siteUrl;
}

export async function signIn(_: AuthState, form: FormData): Promise<AuthState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const next = safeNext(form.get("next"));
  if (!z.email().safeParse(email).success) return { error: "Please enter a valid email." };
  const ip = await clientIp();
  if (!(await allow("signin-ip", ip, LIMITS.signInIp.limit, LIMITS.signInIp.window))) return { error: TOO_MANY };

  if (!password) {
    // One-click email link: also how students migrated from Thinkific sign in (passwords can't be exported)
    if (!(await allow("signin-link", email, LIMITS.signInLink.limit, LIMITS.signInLink.window))) return { error: TOO_MANY };
    if (hasServiceKey()) {
      await sendSignInLink(email, next);
    } else {
      await (await createClient()).auth.signInWithOtp({
        email, options: { emailRedirectTo: `${await origin()}/auth/callback?next=${encodeURIComponent(next)}`, shouldCreateUser: false },
      });
    }
    return { message: LINK_SENT };
  }
  if (!(await allow("signin-pw", `${ip}:${email}`, LIMITS.signInPassword.limit, LIMITS.signInPassword.window))) return { error: TOO_MANY };
  const { error } = await (await createClient()).auth.signInWithPassword({ email, password });
  if (error) return { error: "Incorrect email or password." };
  redirect(next);
}

const signUpSchema = z.object({
  full_name: z.string().trim().min(1, "Please enter your name").max(200),
  email: z.email("Please enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export async function signUp(_: AuthState, form: FormData): Promise<AuthState> {
  const parsed = signUpSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (!(await allow("signup", await clientIp(), LIMITS.signUp.limit, LIMITS.signUp.window))) return { error: TOO_MANY };
  const next = safeNext(form.get("next"));
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email.toLowerCase(),
    password: parsed.data.password,
    options: {
      data: { full_name: parsed.data.full_name },
      emailRedirectTo: `${await origin()}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });
  if (error) return { error: error.message };
  if (data.user && hasServiceKey()) {
    const userId = data.user.id;
    // First-touch client attribution for affiliates / IBs
    const ref = (await cookies()).get("fc_ref")?.value;
    if (ref) await createAdminClient().rpc("record_referral_signup", { p_user: userId, p_code: ref });
    // marketing emails only with an explicit tick (never pre-ticked)
    if (form.get("marketing") === "on") await createAdminClient().from("profiles").update({ marketing_opt_in: true }).eq("id", userId);
    after(() => sendWelcome(userId)); // after the response, so sign-up stays fast
  }
  if (!data.session) return { message: "Check your email to confirm your account." };
  redirect(next);
}

export async function requestPasswordReset(_: AuthState, form: FormData): Promise<AuthState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  if (!z.email().safeParse(email).success) return { error: "Please enter a valid email." };
  if (!(await allow("pw-reset", email, LIMITS.passwordReset.limit, LIMITS.passwordReset.window))) return { error: TOO_MANY };
  if (hasServiceKey()) {
    await sendPasswordReset(email);
  } else {
    await (await createClient()).auth.resetPasswordForEmail(email, { redirectTo: `${await origin()}/auth/callback?next=/dashboard/settings` });
  }
  return { message: "If that email has an account, a reset link is on its way." };
}
