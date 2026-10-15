export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading" className="grid min-h-[60vh] place-items-center bg-surface">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-ink/10 border-t-ink/60" />
    </div>
  );
}
