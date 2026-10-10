import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Leads" };

export default async function LeadsPage() {
  await requireRole(["admin", "support"], "/admin/leads");
  const { data } = await (await createClient()).from("contact_requests").select("*").order("created_at", { ascending: false }).limit(200);
  return (
    <div className="grid gap-6">
      <h1 className="text-3xl font-bold text-primary">Leads</h1>
      <div className="grid gap-3">
        {(data ?? []).map((l) => (
          <div key={l.id} className="fc-card p-4 text-sm">
            <div className="flex flex-wrap justify-between gap-2">
              <span className="font-semibold">{l.name} · <a href={`mailto:${l.email}`} className="underline">{l.email}</a>{l.organization && ` · ${l.organization}`}</span>
              <span className="text-muted">{l.program_type} · {formatDate(l.created_at, "datetime")}</span>
            </div>
            {l.message && <p className="mt-2 whitespace-pre-line text-muted">{l.message}</p>}
          </div>
        ))}
        {!data?.length && <p className="text-muted">No enquiries yet.</p>}
      </div>
    </div>
  );
}
