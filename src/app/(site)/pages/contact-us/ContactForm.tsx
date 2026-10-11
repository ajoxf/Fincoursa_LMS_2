"use client";
import Link from "next/link";
import { useActionState } from "react";
import { submitContact, type ContactState } from "./actions";

const field = "w-full rounded-lg bg-surface px-4 py-4 text-[15px] text-ink placeholder:text-ink/80 focus:outline-2 focus:outline-accent";

export function ContactForm({ programType = "general" }: { programType?: string }) {
  const [state, action, pending] = useActionState<ContactState, FormData>(submitContact, null);
  if (state?.ok) {
    return <p className="mt-6 rounded-lg bg-surface p-6 text-[15px] text-ink">Thanks. A program advisor will be in touch shortly.</p>;
  }
  return (
    <form action={action} className="mt-5 grid gap-2">
      <input name="name" required placeholder="Enter name" aria-label="Name" className={field} />
      <input name="email" type="email" required placeholder="Enter email address" aria-label="Email address" className={field} />
      <textarea name="message" rows={4} placeholder="What are you trying to learn" aria-label="What are you trying to learn" className={field} />
      <input type="hidden" name="program_type" value={programType} />
      <input name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
      <label className="mt-4 flex items-center gap-4 text-[15px] text-ink">
        <input type="checkbox" name="terms" required className="peer sr-only" />
        <span aria-hidden className="flex h-5 w-5 items-center justify-center rounded border border-accent text-transparent peer-checked:bg-accent peer-checked:text-ink peer-focus-visible:outline-2 peer-focus-visible:outline-ink">
          <svg width="10" height="10" viewBox="0 0 10 10"><path d="M2 5.2 4.1 7.2 8 3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </span>
        <span>I accept <Link href="/pages/terms-conditions" className="hover:underline">terms and conditions</Link></span>
      </label>
      {state?.error && <p className="text-sm text-danger">{state.error}</p>}
      <button disabled={pending} className="fc-btn fc-btn-primary fc-btn-lg mt-5 justify-self-start">{pending ? "Sending…" : "Send"}</button>
    </form>
  );
}
