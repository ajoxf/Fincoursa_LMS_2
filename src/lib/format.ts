export function formatDuration(minutes: number) {
  if (minutes < 60) return `${minutes} mins`;
  const h = minutes / 60;
  return `${Number.isInteger(h) ? h : h.toFixed(1)} Hours`;
}
