"use client";
import { useFormStatus } from "react-dom";

export function SaveButton() {
  const { pending } = useFormStatus();
  return <button disabled={pending} className="fc-btn fc-btn-primary justify-self-start disabled:opacity-60">{pending ? "Saving…" : "Save"}</button>;
}
