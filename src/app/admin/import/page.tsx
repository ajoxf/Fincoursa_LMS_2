import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { ImportWizard } from "./ImportWizard";
import { CopyImages } from "./CopyImages";

export const metadata: Metadata = { title: "Import from Thinkific" };

export default async function ImportPage() {
  await requireRole(["admin"], "/admin/import");
  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-3xl font-bold text-primary">Import from Thinkific</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted">
          Export these from Thinkific (read-only, nothing changes there): <b>Users</b>, then the <b>Enrollments / course progress</b> report,
          then <b>Orders</b>. Upload them here in that order. Each step shows what it will do before importing, and you can run any
          step again safely: existing rows are updated, never duplicated, and progress only moves forward.
        </p>
      </div>
      <ImportWizard />
      <CopyImages />
    </div>
  );
}
