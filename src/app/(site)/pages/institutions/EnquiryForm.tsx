"use client";
import Link from "next/link";
import { useActionState } from "react";
import { submitInstitutionEnquiry, type EnquiryState } from "./actions";

const field = "w-full rounded-lg bg-surface px-4 py-3.5 text-[15px] text-ink placeholder:text-ink/70 focus:outline-2 focus:outline-accent";

export function EnquiryForm({ courses, preselect, orgTypes, countries }: {
  courses: { id: string; title: string }[]; preselect?: string; orgTypes: [string, string][]; countries: [string, string][];
}) {
  const [state, action, pending] = useActionState<EnquiryState, FormData>(submitInstitutionEnquiry, null);
  if (state?.ok) {
    return (
      <div className="grid gap-2 rounded-2xl bg-surface p-6 text-ink">
        <p className="text-xl font-semibold">Thank you.</p>
        <p className="text-[15px]">We have your enquiry and have sent you a confirmation email. You will receive a proposal for your team within one working day.</p>
      </div>
    );
  }
  return (
    <form action={action} className="grid gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1.5 text-sm text-ink/80">Your name<input name="contact_name" required className={field} autoComplete="name" /></label>
        <label className="grid gap-1.5 text-sm text-ink/80">Work email<input name="email" type="email" required className={field} autoComplete="email" /></label>
        <label className="grid gap-1.5 text-sm text-ink/80">Organisation<input name="organization" required className={field} autoComplete="organization" /></label>
        <label className="grid gap-1.5 text-sm text-ink/80">Your role<input name="role" className={field} placeholder="e.g. Head of Learning, Dean" /></label>
        <label className="grid gap-1.5 text-sm text-ink/80">Type of organisation
          <select name="org_type" required defaultValue="" className={field}><option value="" disabled>Choose…</option>{orgTypes.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        </label>
        <label className="grid gap-1.5 text-sm text-ink/80">Country
          <select name="country" defaultValue="" className={field}><option value="">Choose…</option>{countries.map(([c, n]) => <option key={c} value={c}>{n}</option>)}</select>
        </label>
        <label className="grid gap-1.5 text-sm text-ink/80">How many people?<input name="team_size" type="number" min={1} className={field} placeholder="e.g. 25" /></label>
      </div>
      {courses.length > 0 && (
        <fieldset className="grid gap-2 text-[15px] text-ink">
          <legend className="mb-1 text-sm text-ink/80">Courses you are interested in</legend>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {courses.map((c) => <label key={c.id} className="flex items-start gap-2"><input type="checkbox" name="course_ids" value={c.id} defaultChecked={c.id === preselect} className="mt-1 accent-black" /> {c.title}</label>)}
          </div>
        </fieldset>
      )}
      <label className="grid gap-1.5 text-sm text-ink/80">What would you like your people to be able to do? (optional)
        <textarea name="message" rows={3} className={field} />
      </label>
      <input name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
      {state?.error && <p className="text-sm text-danger">{state.error}</p>}
      <button disabled={pending} className="fc-btn fc-btn-primary fc-btn-lg mt-2 justify-self-start">{pending ? "Sending…" : "Request a proposal"}</button>
      <p className="text-xs text-muted">We reply within one working day. See our <Link href="/pages/privacy-policy" className="underline">Privacy Policy</Link>.</p>
    </form>
  );
}
