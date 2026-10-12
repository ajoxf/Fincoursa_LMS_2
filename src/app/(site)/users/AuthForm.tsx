"use client";
import { useActionState, useState, useTransition } from "react";
import { resendConfirmation, type AuthState } from "./actions";

type Field = { name: string; label: string; type?: string; required?: boolean; autoComplete?: string; defaultValue?: string };
type Check = { name: string; label: string };

export function AuthForm({ action, fields, submit, next, checks = [] }: {
  action: (s: AuthState, f: FormData) => Promise<AuthState>; fields: Field[]; submit: string; next?: string; checks?: Check[];
}) {
  const [state, formAction, pending] = useActionState(action, null);

  // after sign-up: no form to press again, just where to look and a way to get another email
  if (state?.done) {
    return (
      <div className="grid gap-4 rounded-card border border-line bg-white p-6">
        <p className="text-lg font-semibold text-primary">Check your email</p>
        <p className="text-[15px] leading-relaxed text-ink/85">{state.message}</p>
        <p className="text-sm text-muted">The link works on any device. Once you&apos;ve clicked it, you&apos;ll be signed in.</p>
        {state.email && <Resend email={state.email} next={next} />}
      </div>
    );
  }

  return (
    <form action={formAction} className="grid gap-4">
      {fields.map((f) => (
        <label key={f.name} className="grid gap-1 text-sm font-medium">{f.label}
          <input name={f.name} type={f.type ?? "text"} required={f.required} autoComplete={f.autoComplete} defaultValue={f.defaultValue} className="fc-input" />
        </label>
      ))}
      {checks.map((c) => (
        <label key={c.name} className="flex items-start gap-2 text-sm text-ink/80"><input type="checkbox" name={c.name} className="mt-1" />{c.label}</label>
      ))}
      {next && <input type="hidden" name="next" value={next} />}
      {state?.error && <p className="text-sm text-danger">{state.error}</p>}
      {state?.resend && state.email && <Resend email={state.email} next={next} />}
      {state?.message && <p className="text-sm text-success">{state.message}</p>}
      <button disabled={pending} className="fc-btn fc-btn-primary">{pending ? "Please wait…" : submit}</button>
    </form>
  );
}

function Resend({ email, next }: { email: string; next?: string }) {
  const [res, setRes] = useState<AuthState>(null);
  const [pending, start] = useTransition();
  return (
    <div className="grid gap-1 text-sm">
      <button type="button" disabled={pending} onClick={() => start(async () => setRes(await resendConfirmation(email, next)))}
        className="justify-self-start font-medium text-primary underline disabled:opacity-60">
        {pending ? "Sending…" : "Didn't get it? Send the confirmation email again"}
      </button>
      {res && <p className={res.error ? "text-danger" : "text-success"}>{res.error ?? res.message}</p>}
    </div>
  );
}
