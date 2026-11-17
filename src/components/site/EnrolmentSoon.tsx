/** Shown instead of the buy button while online payment isn't set up yet. */
export function EnrolmentSoon({ sample }: { sample?: boolean }) {
  return (
    <div className="rounded-xl border border-accent/60 bg-accent/10 px-4 py-3.5 text-center">
      <p className="text-lg font-bold text-accent">Enrolment opens soon</p>
      <p className="mt-1 text-sm text-white/75">
        {sample ? "Start with the free sample questions today. We'll email you as soon as enrolment opens." : "Online payment is being switched on. Please check back shortly."}
      </p>
    </div>
  );
}
