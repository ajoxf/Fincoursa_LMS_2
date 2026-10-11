"use client";
import { useActionState } from "react";
import type { AuthState } from "./actions";

type Field = { name: string; label: string; type?: string; required?: boolean; autoComplete?: string; defaultValue?: string };
type Check = { name: string; label: string };

export function AuthForm({ action, fields, submit, next, checks = [] }: {
  action: (s: AuthState, f: FormData) => Promise<AuthState>; fields: Field[]; submit: string; next?: string; checks?: Check[];
}) {
  const [state, formAction, pending] = useActionState(action, null);
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
      {state?.message && <p className="text-sm text-success">{state.message}</p>}
      <button disabled={pending} className="fc-btn fc-btn-primary">{pending ? "Please wait…" : submit}</button>
    </form>
  );
}
