"use client";
import { useFormStatus } from "react-dom";

/** Disabled while the payment is being set up, so a double click can't start two payments. */
export function PayButton({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button disabled={pending} aria-busy={pending} className="fc-btn fc-btn-primary fc-btn-lg justify-self-start disabled:opacity-60">
      {pending ? "Taking you to payment…" : children}
    </button>
  );
}
