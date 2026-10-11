"use client";
import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/** A session time in the viewer's own timezone (rendered after hydration; server shows nothing). */
export function LocalTime({ iso, minutes, prefix = "Your time: " }: { iso: string; minutes?: number | null; prefix?: string }) {
  const text = useSyncExternalStore(subscribe, () => {
    const start = new Date(iso);
    const day = start.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
    const t = (d: Date) => d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    const end = minutes ? `–${t(new Date(start.getTime() + minutes * 60000))}` : "";
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone.replace(/_/g, " ");
    return `${prefix}${day}, ${t(start)}${end} (${zone})`;
  }, () => "");
  return text ? <span>{text}</span> : null;
}
