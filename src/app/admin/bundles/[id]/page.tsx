import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card } from "@/components/dash/Stat";
import { BundleForm } from "./BundleForm";
import { addBundleCourse, moveBundleCourse, removeBundleCourse } from "../actions";

export const metadata: Metadata = { title: "Edit programme" };

export default async function EditBundle({ params }: PageProps<"/admin/bundles/[id]">) {
  const { id } = await params;
  await requireRole(["admin"], `/admin/bundles/${id}`);
  const db = createAdminClient();
  const [{ data: bundle }, { data: courses }] = await Promise.all([
    db.from("bundles").select("*, prices(amount_minor, currency, is_active), bundle_courses(course_id, position, course:courses(title, status))").eq("id", id).maybeSingle(),
    db.from("courses").select("id, title").neq("status", "archived").order("title"),
  ]);
  if (!bundle) notFound();
  const price = (bundle.prices ?? []).find((p: { is_active: boolean }) => p.is_active) ?? null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const included = [...(bundle.bundle_courses ?? [])].sort((a: any, b: any) => a.position - b.position) as any[];
  const inIds = new Set(included.map((c) => c.course_id));

  return (
    <div className="grid gap-6">
      <div>
        <Link href="/admin/bundles" className="text-sm text-muted hover:underline">← All programmes</Link>
        <h1 className="mt-2 text-3xl font-bold text-primary">{bundle.title}</h1>
        <Link href={`/programmes/${bundle.slug}`} className="text-sm underline">View programme page</Link>
      </div>
      <Card title="Details & price"><BundleForm bundle={bundle} price={price} /></Card>
      <Card title={`Courses in this programme (${included.length})`}>
        <ul className="divide-y divide-line text-sm">
          {included.map((c, i) => (
            <li key={c.course_id} className="flex items-center gap-2 py-2">
              <form className="flex gap-1">
                <button formAction={moveBundleCourse.bind(null, id, c.course_id, -1)} disabled={i === 0} aria-label="Move up" className="h-7 w-7 rounded-md border border-line disabled:opacity-30">↑</button>
                <button formAction={moveBundleCourse.bind(null, id, c.course_id, 1)} disabled={i === included.length - 1} aria-label="Move down" className="h-7 w-7 rounded-md border border-line disabled:opacity-30">↓</button>
              </form>
              <span className="flex-1 font-medium">{c.course?.title}{c.course?.status !== "published" && <span className="ml-2 text-xs text-warning">({c.course?.status})</span>}</span>
              <form action={removeBundleCourse.bind(null, id, c.course_id)}><button className="text-xs text-danger underline">Remove</button></form>
            </li>
          ))}
          {!included.length && <li className="py-2 text-muted">No courses yet.</li>}
        </ul>
        <form action={addBundleCourse.bind(null, id)} className="mt-4 flex flex-wrap gap-2">
          <select name="course_id" required className="fc-input min-w-64 flex-1">
            <option value="">Add a course…</option>
            {(courses ?? []).filter((c) => !inIds.has(c.id)).map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
          <button className="fc-btn fc-btn-dark">Add</button>
        </form>
        <p className="mt-2 text-xs text-muted">Buying the programme enrols the student in every course listed here. Revenue is split equally across these courses for instructor earnings.</p>
      </Card>
    </div>
  );
}
