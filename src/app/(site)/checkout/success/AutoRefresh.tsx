"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/** While a card payment is being confirmed, re-check every few seconds (for up to 2 minutes). */
export function AutoRefresh({ every = 4000, maxTries = 30 }: { every?: number; maxTries?: number }) {
  const router = useRouter();
  const [tries, setTries] = useState(0);
  useEffect(() => {
    if (tries >= maxTries) return;
    const t = setTimeout(() => { router.refresh(); setTries((n) => n + 1); }, every);
    return () => clearTimeout(t);
  }, [tries, every, maxTries, router]);
  return tries >= maxTries
    ? <p className="mt-4 text-sm text-ink/70">This is taking longer than usual. You&apos;ll get an email as soon as it&apos;s confirmed, and the course will appear in your dashboard.</p>
    : <p className="mt-4 text-xs text-ink/50" aria-live="polite">Checking automatically…</p>;
}
