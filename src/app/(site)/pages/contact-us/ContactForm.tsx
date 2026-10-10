"use client";
import { useActionState } from "react";
import { submitContact, type ContactState } from "./actions";

export function ContactForm() {
  const [state, action, pending] = useActionState<ContactState, FormData>(submitContact, null);
  if (state?.ok) return <div className="fc-card p-8 text-lg">Thanks — our team will be in touch shortly.</div>;
  return (
    <form action={action} className="fc-card grid gap-4 p-6">
      <label className="grid gap-1 text-sm font-medium">Name<input name="name" required className="fc-input" /></label>
      <label className="grid gap-1 text-sm font-medium">Email<input name="email" type="email" required className="fc-input" /></label>
      <label className="grid gap-1 text-sm font-medium">Organization<input name="organization" className="fc-input" /></label>
      <label className="grid gap-1 text-sm font-medium">I&apos;m interested in
        <select name="program_type" className="fc-input" defaultValue="general">
          <option value="general">General enquiry</option>
          <option value="corporate">Corporate training</option>
          <option value="university">University &amp; academic</option>
          <option value="custom">Custom programs</option>
        </select>
      </label>
      <label className="grid gap-1 text-sm font-medium">Message<textarea name="message" rows={5} className="fc-input" /></label>
      <input name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
      {state?.error && <p className="text-sm text-danger">{state.error}</p>}
      <button disabled={pending} className="fc-btn fc-btn-primary">{pending ? "Sending…" : "Talk to our Team"}</button>
    </form>
  );
}
