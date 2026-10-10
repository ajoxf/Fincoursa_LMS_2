export function SectionHeading({ label, title, sub, center, dark }: {
  label?: string; title: string; sub?: React.ReactNode; center?: boolean; dark?: boolean;
}) {
  return (
    <div className={`${center ? "mx-auto text-center" : ""} max-w-2xl`}>
      {label && <p className="fc-label">{label}</p>}
      <h2 className={`mt-2 text-3xl font-bold tracking-tight md:text-4xl ${dark ? "text-white" : "text-primary"}`}>{title}</h2>
      {sub && <div className={`mt-3 text-base ${dark ? "text-on-dark/80" : "text-muted"}`}>{sub}</div>}
    </div>
  );
}
