import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { Card } from "@/components/dash/Stat";
import { getLegal } from "@/lib/site-settings";
import { LEGAL, type LegalKind } from "@/lib/legal";
import { LegalEditor } from "./LegalEditor";

export const metadata: Metadata = { title: "Terms & privacy" };

export default async function LegalAdmin({ searchParams }: PageProps<"/admin/legal">) {
  await requireRole(["admin"], "/admin/legal");
  const kind: LegalKind = (await searchParams).doc === "privacy" ? "privacy" : "terms";
  const doc = await getLegal(kind);
  const meta = LEGAL[kind];
  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-3xl font-bold text-primary">Terms &amp; privacy</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted">Edit the Terms &amp; Conditions and Privacy Policy shown on the site, or import them from a Word file. Each publish keeps the earlier version for your records. Have your lawyer approve the wording.</p>
      </div>
      <div className="flex gap-2 border-b border-line text-sm">
        {(["terms", "privacy"] as const).map((k) => (
          <Link key={k} href={`/admin/legal?doc=${k}`}
            className={`-mb-px border-b-2 px-3 py-2 ${k === kind ? "border-accent font-semibold text-primary" : "border-transparent text-muted hover:text-primary"}`}>
            {LEGAL[k].title}
          </Link>
        ))}
      </div>
      <Card title={meta.title}>
        <LegalEditor key={kind} kind={kind} title={meta.title} path={meta.path} doc={doc} />
      </Card>
    </div>
  );
}
