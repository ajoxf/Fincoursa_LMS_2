import type { Metadata } from "next";
import Link from "next/link";
import { AuthForm } from "../AuthForm";
import { signIn } from "../actions";

export const metadata: Metadata = { title: "Sign In" };

export default async function SignInPage({ searchParams }: PageProps<"/users/sign_in">) {
  const next = (await searchParams).next;
  const nextStr = typeof next === "string" ? next : undefined;
  return (
    <section className="fc-container max-w-md py-20">
      <h1 className="text-3xl font-bold text-primary">Sign In</h1>
      <p className="mt-2 text-sm text-muted">Leave the password empty to get a one-time sign-in link by email.</p>
      <div className="mt-8">
        <AuthForm action={signIn} next={nextStr} submit="Sign In" fields={[
          { name: "email", label: "Email", type: "email", required: true, autoComplete: "email" },
          { name: "password", label: "Password", type: "password", autoComplete: "current-password" },
        ]} />
      </div>
      <div className="mt-6 flex justify-between text-sm">
        <Link href="/users/password" className="text-muted hover:underline">Forgot password?</Link>
        <Link href={`/users/sign_up${nextStr ? `?next=${encodeURIComponent(nextStr)}` : ""}`} className="font-semibold text-primary hover:underline">Create an account</Link>
      </div>
    </section>
  );
}
