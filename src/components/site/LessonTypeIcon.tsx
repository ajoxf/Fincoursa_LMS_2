/** Small line icon for a lesson type (video, quiz, live, or a document for everything else). Used on course pages and in the player. */
export function LessonTypeIcon({ type, size = 14 }: { type: string; size?: number }) {
  const p = { width: size, height: size, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.3, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;
  if (type === "video") return <svg {...p}><rect x="1.5" y="4" width="9" height="8" rx="1" /><path d="m10.5 7 4-2v6l-4-2" /></svg>;
  if (type === "quiz") return <svg {...p}><path d="m2 4.2 1.3 1.3L5.6 3.2M8 4.5h6M2 10.7 3.3 12l2.3-2.3M8 11h6" /></svg>;
  if (type === "live") return <svg {...p}><circle cx="8" cy="8" r="1.8" /><path d="M5 5a4.2 4.2 0 0 0 0 6M11 5a4.2 4.2 0 0 1 0 6M3 3a7 7 0 0 0 0 10M13 3a7 7 0 0 1 0 10" /></svg>;
  return <svg {...p}><path d="M4 1.5h5.5L12.5 4.5V14.5H4z" /><path d="M6 8h4.5M6 10.5h4.5" /></svg>;
}
