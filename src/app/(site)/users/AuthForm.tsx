"use client";
import { useActionState } from "react";
import type { AuthState } from "./actions";

type Field = { name: string; label: string; type?: string; required?: boolean; autoComplete?: string };

export function AuthForm({ action, fields, submit, next }: {
  action: (s: AuthState, f: FormData) => Promise<AuthState>; fields: Field[]; submit: string; next?: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <form action={formAction} className="grid gap-4">
      {fields.map((f) => (
        <label key={f.name} className="grid gap-1 text-sm font-medium">{f.label}
          <input name={f.name} type={f.type ?? "text"} required={f.required} autoComplete={f.autoComplete} className="fc-input" />
        </label>
      ))}
      {next && <input type="hidden" name="next" value={next} />}
      {state?.error && <p className="text-sm text-danger">{state.error}</p>}
      {state?.message && <p className="text-sm text-success">{state.message}</p>}
      <button disabled={pending} className="fc-btn fc-btn-primary">{pending ? "Please wait…" : submit}</button>
    </form>
  );
}
