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
