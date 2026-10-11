import { myAgreements } from "@/lib/agreements";
import { formatDate } from "@/lib/format";

/** "Your agreement" for instructors and partners: their signed copies, to download. Nothing when there are none. */
export async function MyAgreements({ userId }: { userId: string }) {
  const items = (await myAgreements(userId)).filter((a) => a.has_file && a.status === "signed");
  if (!items.length) return null;
  return (
    <section className="fc-card min-w-0 p-5">
      <h2 className="mb-3 font-semibold text-primary">Your agreement with FinCoursa</h2>
      <ul className="divide-y divide-line text-sm">
        {items.map((a) => (
          <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
            <span>{a.title}<span className="ml-2 text-xs text-muted">signed {formatDate(a.signed_at)}{a.valid_until && ` · valid until ${formatDate(a.valid_until)}`}</span></span>
            <a href={`/api/agreements/${a.id}`} className="text-sm underline">Download</a>
          </li>
        ))}
      </ul>
    </section>
  );
}
