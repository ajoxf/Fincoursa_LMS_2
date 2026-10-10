"use server";
import { redirect } from "next/navigation";
import { headers, cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";

export type AuthState = { error?: string; message?: string } | null;

const safeNext = (n: FormDataEntryValue | null) => {
  const s = typeof n === "string" ? n : "";
  return s.startsWith("/") && !s.startsWith("//") ? s : "/dashboard";
};

async function origin() {
  const h = await headers();
  return h.get("origin") ?? env.siteUrl;
}

export async function signIn(_: AuthState, form: FormData): Promise<AuthState> {
  const supabase = await createClient();
  const email = String(form.get("email") ?? "");
  const password = String(form.get("password") ?? "");
  const next = safeNext(form.get("next"));
  if (!password) {
    // Magic link — also the path for students migrated from Thinkific (passwords can't be exported)
    const { error } = await supabase.auth.signInWithOtp({
      email, options: { emailRedirectTo: `${await origin()}/auth/callback?next=${encodeURIComponent(next)}`, shouldCreateUser: false },
    });
    return error ? { error: error.message } : { message: "Check your email for a sign-in link." };
  }
  const { error } = await supabase.auth.signInWithPassword({ email, password });
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
  const next = safeNext(form.get("next"));
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { full_name: parsed.data.full_name },
      emailRedirectTo: `${await origin()}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });
  if (error) return { error: error.message };
  // First-touch client attribution for affiliates / IBs
  const ref = (await cookies()).get("fc_ref")?.value;
  if (ref && data.user) await createAdminClient().rpc("record_referral_signup", { p_user: data.user.id, p_code: ref });
  if (!data.session) return { message: "Check your email to confirm your account." };
  redirect(next);
}

export async function requestPasswordReset(_: AuthState, form: FormData): Promise<AuthState> {
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(String(form.get("email") ?? ""), {
    redirectTo: `${await origin()}/auth/callback?next=/dashboard/settings`,
  });
  return error ? { error: error.message } : { message: "If that email has an account, a reset link is on its way." };
}
