"use client";
import { useActionState } from "react";
import { notifyMe, type NotifyState } from "@/app/actions/notify";

/** "Coming soon" course: collect an email so we can tell the visitor when it launches (saved to Admin → Leads). */
export function NotifyMe({ courseId }: { courseId: string }) {
  const [state, action, pending] = useActionState<NotifyState, FormData>(notifyMe.bind(null, courseId), null);
  if (state?.ok) return <p className="rounded-md bg-white/10 p-3 text-left text-[15px]">Thanks! We&apos;ll email you when this course launches.</p>;
  return (
    <form action={action} className="grid gap-2 text-left">
      <input name="name" required maxLength={200} placeholder="Your name" aria-label="Your name" className="fc-input !bg-white text-ink" />
      <input name="email" type="email" required maxLength={320} placeholder="Your email" aria-label="Your email" className="fc-input !bg-white text-ink" />
      {/* honeypot: hidden from people, filled in by bots */}
      <input name="website" tabIndex={-1} autoComplete="off" aria-hidden className="hidden" />
      <button disabled={pending} className="fc-btn fc-btn-primary w-full !py-4">{pending ? "Saving…" : "Notify me at launch"}</button>
      {state?.error && <p className="text-sm text-danger">{state.error}</p>}
    </form>
  );
}
