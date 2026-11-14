"use client";
import { useEffect, useSyncExternalStore } from "react";
import Link from "next/link";

// Ad measurement (LinkedIn Insight Tag). It loads only after the visitor accepts cookies; the choice is kept
// in a first-party cookie for a year. With no tag configured nothing is shown or loaded.

type Lintrk = ((action: string, data: Record<string, unknown>) => void) & { q?: unknown[] };
declare global {
  interface Window { _linkedin_partner_id?: string; _linkedin_data_partner_ids?: string[]; lintrk?: Lintrk; fcConversions?: Record<string, string | null> }
}

const CONSENT = "fc_consent";
const readConsent = () => document.cookie.match(/(?:^|; )fc_consent=(yes|no)/)?.[1] ?? "none";
// tell the banner when the choice changes
const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };

function loadLinkedIn(partnerId: string) {
  if (window.lintrk || document.getElementById("li-insight")) return;
  window._linkedin_partner_id = partnerId;
  window._linkedin_data_partner_ids = [...(window._linkedin_data_partner_ids ?? []), partnerId];
  const q: unknown[] = [];
  const fn = ((a: string, b: Record<string, unknown>) => { q.push([a, b]); }) as Lintrk;
  fn.q = q;
  window.lintrk = fn;
  const s = document.createElement("script");
  s.id = "li-insight";
  s.async = true;
  s.src = "https://snap.licdn.com/li.lms-analytics/insight.min.js";
  document.head.appendChild(s);
}

/** Record a conversion ("signup" / "purchase") if the tag is loaded and that conversion is set up. */
export function trackConversion(kind: "signup" | "purchase") {
  const id = window.fcConversions?.[kind];
  if (id && window.lintrk) window.lintrk("track", { conversion_id: Number(id) });
}

export function Tracking({ partnerId, conversions }: { partnerId: string; conversions: Record<string, string | null> }) {
  // "unknown" while rendering on the server, so the banner never flashes before the cookie is read
  const consent = useSyncExternalStore(subscribe, readConsent, () => "unknown");

  useEffect(() => {
    window.fcConversions = conversions;
    if (consent === "yes") loadLinkedIn(partnerId);
  }, [partnerId, conversions, consent]);

  const choose = (yes: boolean) => {
    document.cookie = `${CONSENT}=${yes ? "yes" : "no"}; Max-Age=${365 * 86400}; Path=/; SameSite=Lax; Secure`;
    listeners.forEach((fn) => fn());
  };

  if (consent !== "none") return null; // only while undecided
  return (
    <div role="dialog" aria-label="Cookies" className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-xl rounded-xl bg-ink p-4 text-sm text-white shadow-lg sm:flex sm:items-center sm:gap-4">
      <p className="flex-1">We use cookies to measure our LinkedIn ads. Essential cookies are always on. <Link href="/pages/privacy-policy" className="underline">Privacy Policy</Link></p>
      <div className="mt-3 flex shrink-0 gap-2 sm:mt-0">
        <button type="button" onClick={() => choose(false)} className="rounded-lg border border-white/40 px-3 py-1.5">Decline</button>
        <button type="button" onClick={() => choose(true)} className="rounded-lg bg-accent px-3 py-1.5 font-semibold text-ink">Accept</button>
      </div>
    </div>
  );
}

/** Drop on a page to record a conversion once when it renders (e.g. a paid order's success page). */
export function TrackConversion({ kind, once }: { kind: "signup" | "purchase"; /** e.g. the order id: count it only once per browser */ once?: string }) {
  useEffect(() => {
    const key = once ? `fc_conv_${kind}_${once}` : null;
    try { if (key && localStorage.getItem(key)) return; } catch { /* storage blocked: still record it */ }
    // the tag may still be loading; its queue keeps the event until it is ready
    const t = setTimeout(() => {
      trackConversion(kind);
      try { if (key) localStorage.setItem(key, "1"); } catch { /* ignore */ }
    }, 300);
    return () => clearTimeout(t);
  }, [kind, once]);
  return null;
}
