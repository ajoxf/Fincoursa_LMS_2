import type { Metadata } from "next";
import { AuthForm } from "../AuthForm";
import { requestPasswordReset } from "../actions";

export const metadata: Metadata = { title: "Reset password" };

export default function PasswordPage() {
  return (
    <section className="fc-container max-w-md py-20">
      <h1 className="text-3xl font-bold text-primary">Reset your password</h1>
      <div className="mt-8">
        <AuthForm action={requestPasswordReset} submit="Send reset link"
          fields={[{ name: "email", label: "Email", type: "email", required: true, autoComplete: "email" }]} />
      </div>
    </section>
  );
}
