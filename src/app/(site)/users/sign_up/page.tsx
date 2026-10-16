import type { Metadata } from "next";
import Link from "next/link";
import { AuthForm } from "../AuthForm";
import { signUp } from "../actions";

export const metadata: Metadata = { title: "Create account" };

export default async function SignUpPage({ searchParams }: PageProps<"/users/sign_up">) {
  const next = (await searchParams).next;
  return (
    <section className="fc-container max-w-md py-20">
      <h1 className="text-3xl font-bold text-primary">Create your account</h1>
      <div className="mt-8">
        <AuthForm action={signUp} next={typeof next === "string" ? next : undefined} submit="Create account" fields={[
          { name: "full_name", label: "Full name", required: true, autoComplete: "name" },
          { name: "email", label: "Email", type: "email", required: true, autoComplete: "email" },
          { name: "password", label: "Password", type: "password", required: true, autoComplete: "new-password" },
        ]} checks={[{ name: "marketing", label: "Email me about new courses, live workshops and offers. Unsubscribe any time." }]} />
      </div>
      <p className="mt-4 text-xs text-muted">By creating an account you agree to our <Link href="/pages/terms-conditions" target="_blank" className="underline">Terms &amp; Conditions</Link> and <Link href="/pages/privacy-policy" target="_blank" className="underline">Privacy Policy</Link>.</p>
      <p className="mt-6 text-sm">Already have an account? <Link href="/users/sign_in" className="font-semibold text-primary hover:underline">Sign In</Link></p>
    </section>
  );
}
