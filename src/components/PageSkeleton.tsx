/** Shown instantly while the next page loads, so a click always gives feedback. */
export function PageSkeleton({ variant = "dash" }: { variant?: "dash" | "site" }) {
  const bar = "animate-pulse rounded-md bg-ink/[0.07]";
  if (variant === "site") {
    return (
      <div aria-busy="true" aria-label="Loading" className="flex-1">
        <div className="bg-surface-dark">
          <div className="fc-container grid gap-5 py-20">
            <div className="h-5 w-28 animate-pulse rounded-full bg-white/10" />
            <div className="h-12 w-full max-w-xl animate-pulse rounded-md bg-white/10" />
            <div className="h-4 w-full max-w-md animate-pulse rounded-md bg-white/10" />
          </div>
        </div>
        <div className="fc-container grid gap-4 py-16 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => <div key={i} className={`${bar} h-56`} />)}
        </div>
      </div>
    );
  }
  return (
    <div aria-busy="true" aria-label="Loading" className="grid gap-6">
      <div className={`${bar} h-9 w-64`} />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={i} className={`${bar} h-24`} />)}</div>
      <div className={`${bar} h-64`} />
    </div>
  );
}
