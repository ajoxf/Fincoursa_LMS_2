/** Pill label + light display heading + optional sub-line, as used on every fincoursa.com section. */
export function SectionHeading({ label, title, sub, center = true, dark }: {
  label?: string; title: React.ReactNode; sub?: React.ReactNode; center?: boolean; dark?: boolean;
}) {
  return (
    <div className={center ? "mx-auto max-w-3xl text-center" : "max-w-2xl"}>
      {label && <span className={`fc-pill ${dark ? "fc-pill-dark" : ""}`}>{label}</span>}
      <h2 className={`fc-h2 mt-4 ${dark ? "text-white" : "text-ink"}`}>{title}</h2>
      {sub && <div className={`mx-auto mt-4 max-w-2xl text-[15px] leading-relaxed ${dark ? "text-on-dark/85" : "text-ink/85"}`}>{sub}</div>}
    </div>
  );
}
