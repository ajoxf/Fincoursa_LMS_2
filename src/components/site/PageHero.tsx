/** Black page hero: lime pill label, large light title, optional body and chips. */
export function PageHero({ label, title, children, aside }: {
  label: string; title: React.ReactNode; children?: React.ReactNode; aside?: React.ReactNode;
}) {
  return (
    <section className="bg-surface-dark text-white">
      <div className="fc-container grid items-center gap-10 pb-24 pt-16 md:grid-cols-[1fr_auto] md:pt-24">
        <div>
          <span className="fc-pill fc-pill-dark">{label}</span>
          <h1 className="fc-display mt-5 max-w-[620px] text-[2.6rem] md:text-[3.75rem]">{title}</h1>
          {children}
        </div>
        {aside}
      </div>
    </section>
  );
}

export function Chips({ items, firstLime }: { items: string[]; firstLime?: boolean }) {
  return (
    <div className="mt-6 flex flex-wrap gap-2">
      {items.map((t, i) => (
        <span key={t} className={`fc-chip ${firstLime && i === 0 ? "fc-chip-lime" : "text-white"}`}>{t}</span>
      ))}
    </div>
  );
}
