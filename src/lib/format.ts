export function formatDuration(minutes: number) {
  if (minutes < 60) return `${minutes} mins`;
  const h = minutes / 60;
  return `${Number.isInteger(h) ? h : h.toFixed(1)} Hours`;
}

/** Business time zone for every date shown (servers run in UTC). */
export const TIME_ZONE = process.env.NEXT_PUBLIC_TIME_ZONE ?? "Asia/Dubai";

export function formatDate(d: string | number | Date | null | undefined, style: "short" | "long" | "datetime" = "short") {
  if (d == null) return "";
  const date = new Date(d);
  if (style === "datetime") return date.toLocaleString("en-GB", { timeZone: TIME_ZONE, dateStyle: "medium", timeStyle: "short" });
  return date.toLocaleDateString("en-GB", { timeZone: TIME_ZONE, ...(style === "long" ? { dateStyle: "long" } : { day: "numeric", month: "short", year: "numeric" }) });
}

/** Timezones shown next to live sessions (as on the masterclass flyers). */
export const SESSION_ZONES: { tz: string; label: string }[] = [
  { tz: "Asia/Dubai", label: "GST (UAE)" },
  { tz: "Asia/Kolkata", label: "IST" },
  { tz: "America/New_York", label: "ET" },
  { tz: "Europe/London", label: "UK" },
];

/** "Sat, 24 Oct 2026" in a timezone */
export function sessionDay(iso: string, tz: string = TIME_ZONE) {
  return new Date(iso).toLocaleDateString("en-GB", { timeZone: tz, weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

/** "5:30–8:30 pm" in a timezone */
export function sessionTimes(iso: string, minutes: number | null | undefined, tz: string = TIME_ZONE) {
  const f = (d: Date) => d.toLocaleTimeString("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).toLowerCase();
  const start = new Date(iso);
  return minutes ? `${f(start)}–${f(new Date(start.getTime() + minutes * 60000))}` : f(start);
}

/** True until the session has ended (start + length, default 1h). Evaluated per request on the server. */
export function sessionNotOver(iso: string, minutes?: number | null) {
  return new Date(iso).getTime() + (minutes ?? 60) * 60000 > Date.now();
}

/** Students can join from 15 minutes before the start until 30 minutes after the scheduled end. */
export function joinWindow(iso: string, minutes?: number | null) {
  const start = new Date(iso).getTime();
  const now = Date.now();
  return { open: now >= start - 15 * 60000 && now <= start + ((minutes ?? 60) + 30) * 60000, ended: now > start + (minutes ?? 60) * 60000 };
}

const regionNames = new Intl.DisplayNames(["en"], { type: "region" });
/** "DE" -> "Germany" */
export function countryName(code: string | null | undefined) {
  if (!code) return "";
  try { return regionNames.of(code.toUpperCase()) ?? code; } catch { return code; }
}

/** Every ISO country, sorted by name, for billing-country pickers. */
export const ALL_COUNTRIES: [string, string][] = (() => {
  const codes: string[] = [];
  for (let a = 65; a <= 90; a++) for (let b = 65; b <= 90; b++) {
    const c = String.fromCharCode(a, b);
    try { const n = regionNames.of(c); if (n && n !== c && !/Unknown/.test(n)) codes.push(c); } catch { /* not a region */ }
  }
  const skip = new Set(["EU", "EZ", "UN", "QO", "XA", "XB", "ZZ"]);
  return codes.filter((c) => !skip.has(c)).map((c) => [c, regionNames.of(c)!] as [string, string]).sort((x, y) => x[1].localeCompare(y[1]));
})();

/** ISO timestamp N days ago (for report windows; evaluated per request on the server). */
export function daysAgoIso(days: number) {
  return new Date(Date.now() - days * 864e5).toISOString();
}

/** Current time for server components (kept out of render bodies for the purity lint rule). */
export const nowMs = () => Date.now();
