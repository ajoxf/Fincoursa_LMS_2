import { Markdown } from "./Markdown";
import { formatDate } from "@/lib/format";
import { getLegal } from "@/lib/site-settings";
import { LEGAL, type LegalKind } from "@/lib/legal";

/** Public Terms / Privacy page: the text saved in Admin → Terms & privacy. */
export async function LegalPage({ kind }: { kind: LegalKind }) {
  const doc = await getLegal(kind);
  const title = LEGAL[kind].title;
  return (
    <article className="fc-container max-w-3xl py-16 md:py-20">
      <h1 className="text-4xl font-bold text-primary">{title}</h1>
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted">
        {doc.updated_at && <span>Last updated {formatDate(doc.updated_at, "long")}</span>}
        {doc.pdf_url && <a href={doc.pdf_url} target="_blank" rel="noopener noreferrer" className="font-medium text-ink underline">Download PDF</a>}
      </div>
      {doc.body.trim()
        ? <Markdown text={doc.body} className="mt-10" />
        : <p className="mt-10 text-muted">This page is being updated. For any questions, please <a href="/pages/contact-us" className="underline">contact us</a>.</p>}
    </article>
  );
}
