"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const subscribe = () => () => {};

function useNow(intervalMs: number) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const id = setInterval(tick, intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

function countdown(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  return d > 0 ? `${d}d ${h}h ${m}m` : h > 0 ? `${h}h ${m}m` : `${m}m ${s % 60}s`;
}

/**
 * Live lesson before/while it happens. The Zoom link only reaches the browser once the join window is open
 * (the server decides); when the countdown reaches that point the page refreshes to fetch it.
 */
export function LiveSession({ lessonId, title, startsAt, minutes, joinUrl, ended, canAttend, track, gcalUrl }: {
  lessonId: string; title: string; startsAt: string; minutes: number; joinUrl: string | null; ended: boolean;
  canAttend: boolean; track: boolean; gcalUrl: string;
}) {
  const router = useRouter();
  const now = useNow(1000);
  const start = new Date(startsAt).getTime();
  const opensAt = start - 15 * 60000;
  // A string snapshot (stable between renders), split into its parts below
  const localStr = useSyncExternalStore(subscribe, () => {
    const d = new Date(startsAt);
    const t = (x: Date) => x.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    return [
      d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" }),
      `${t(d)} – ${t(new Date(start + minutes * 60000))}`,
      Intl.DateTimeFormat().resolvedOptions().timeZone.replace(/_/g, " "),
    ].join("|");
  }, () => "");
  const [day, time, zone] = localStr ? localStr.split("|") : [];
  const local = localStr ? { day, time, zone } : null;

  useEffect(() => {
    if (now !== null && !joinUrl && !ended && now >= opensAt && now < opensAt + 5000) router.refresh();
  }, [now, joinUrl, ended, opensAt, router]);

  const join = async () => {
    if (!joinUrl) return;
    window.open(joinUrl, "_blank", "noopener");
    // attending counts as completing the session
    if (track) await createClient().rpc("complete_lesson", { p_lesson: lessonId });
  };

  return (
    <div className="flex aspect-video flex-col items-center justify-center gap-5 bg-black px-6 py-10 text-center text-white">
      <span className="fc-pill fc-pill-dark">{ended ? "Session ended" : "● Live on Zoom"}</span>
      <h3 className="fc-h2 max-w-[640px]">{title}</h3>
      {local && (
        <p className="text-[15px] text-white/85">{local.day}<br />{local.time} <span className="text-white/60">({local.zone})</span></p>
      )}
      {ended ? (
        <p className="max-w-[460px] text-[15px] text-white/80">The recording will appear right here, usually within a few hours of the session ending.</p>
      ) : joinUrl ? (
        <button onClick={join} className="fc-btn fc-btn-primary fc-btn-lg">Join on Zoom →</button>
      ) : !canAttend ? (
        <p className="text-[15px] text-white/80">Register for this masterclass to get the join link.</p>
      ) : (
        <>
          {now !== null && <p className="text-4xl font-light tabular-nums tracking-tight">{countdown(start - now)}</p>}
          <p className="text-sm text-white/70">The Join button appears here 15 minutes before the start.</p>
          <div className="flex flex-wrap justify-center gap-3">
            <a href={gcalUrl} target="_blank" rel="noopener" className="fc-btn fc-btn-outline-lime !min-w-0">Add to Google Calendar</a>
            <a href={`/api/calendar/${lessonId}`} className="fc-btn fc-btn-outline !min-w-0 text-white">Download .ics (Outlook, Apple)</a>
          </div>
        </>
      )}
    </div>
  );
}
