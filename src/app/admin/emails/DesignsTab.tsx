import { formatDate } from "@/lib/format";
import { Card } from "@/components/dash/Stat";
import { listDesigns, renderDesign } from "@/lib/email/designs";
import { setDesignStatus } from "./actions";

const STATUS = { approved: "Approved, in the Design list", draft: "Draft, waiting for your approval", retired: "Retired" } as const;
const ORDER = { draft: 0, approved: 1, retired: 2 } as const;

/** Every saved design with a computer and a phone preview. Admins approve, retire or move back to draft. */
export async function DesignsTab({ isAdmin, open }: { isAdmin: boolean; open?: string }) {
  const all = await listDesigns();
  const designs = (isAdmin ? all : all.filter((d) => d.status === "approved")).sort((a, b) => ORDER[a.status] - ORDER[b.status] || a.sort - b.sort);
  const drafts = designs.filter((d) => d.status === "draft").length;
  return (
    <div className="grid gap-6">
      <p className="max-w-3xl text-sm text-muted">
        Ready-made emails your team can pick under <b>Send an email → Design</b>. New designs are made with Claude and arrive here as drafts.
        {isAdmin ? " Check the preview on computer and phone, then approve it to add it to the Design list." : " Only approved designs are shown."}
      </p>
      {isAdmin && drafts > 0 && <p className="rounded-lg bg-warning/10 p-3 text-sm text-warning">{drafts} new design{drafts === 1 ? " is" : "s are"} waiting for your approval.</p>}
      {!designs.length && <p className="text-sm text-muted">No designs yet.</p>}
      {designs.map((d) => {
        const { html } = renderDesign(d, { tag: "preview", unsubscribeUrl: "#", note: "", firstName: "" });
        const shown = open === d.id || (d.status === "draft" && !open);
        return (
          <Card key={d.id} title={d.name}>
            <div className="grid gap-3">
              <div className="flex flex-wrap items-baseline justify-between gap-3 text-sm">
                <div className="min-w-0">
                  <span className={d.status === "approved" ? "text-success" : d.status === "draft" ? "text-warning" : "text-muted"}>{STATUS[d.status]}</span>
                  <span className="text-muted"> · added {formatDate(d.created_at)}{d.approved_at ? ` · approved ${formatDate(d.approved_at)}` : ""}</span>
                  {d.description && <p className="text-muted">{d.description}</p>}
                  {d.default_subject && <p className="text-muted">Suggested subject: <span className="text-ink">{d.default_subject}</span></p>}
                </div>
                {isAdmin && (
                  <div className="flex flex-wrap gap-2">
                    {d.status !== "approved" && <form action={setDesignStatus.bind(null, d.id, "approved")}><button className="fc-btn fc-btn-primary !min-w-0 !px-4 !py-2 text-sm">Approve</button></form>}
                    {d.status === "approved" && <form action={setDesignStatus.bind(null, d.id, "retired")}><button className="fc-btn fc-btn-outline !min-w-0 !px-4 !py-2 text-sm text-ink">Retire</button></form>}
                    {d.status === "retired" && <form action={setDesignStatus.bind(null, d.id, "draft")}><button className="fc-btn fc-btn-outline !min-w-0 !px-4 !py-2 text-sm text-ink">Back to draft</button></form>}
                  </div>
                )}
              </div>
              <details open={shown} className="group">
                <summary className="cursor-pointer text-sm font-medium text-primary">Preview on computer and phone</summary>
                <div className="mt-3 flex flex-wrap items-start gap-4">
                  <div className="grid gap-1"><span className="text-xs text-muted">Computer</span>
                    <iframe title={`${d.name} on a computer`} srcDoc={html} sandbox="" className="h-[900px] w-[740px] max-w-full rounded-lg border border-line bg-black" /></div>
                  <div className="grid gap-1"><span className="text-xs text-muted">Phone</span>
                    <iframe title={`${d.name} on a phone`} srcDoc={html} sandbox="" className="h-[900px] w-[380px] max-w-full rounded-lg border border-line bg-black" /></div>
                </div>
              </details>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
