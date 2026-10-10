import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatMoney } from "@/lib/money";
import { Card } from "@/components/dash/Stat";
import { createCourseDraft } from "./actions";

export const metadata: Metadata = { title: "Courses" };

const statusStyle: Record<string, string> = { draft: "bg-warning/15 text-warning", published: "bg-success/15 text-success", archived: "bg-line text-muted" };

export default async function AdminCourses() {
  await requireRole(["admin"], "/admin/courses");
  const db = createAdminClient();
  const [{ data: courses }, { data: enrolls }] = await Promise.all([
    db.from("courses").select("id, slug, title, status, thumbnail_url, updated_at, course_instructors(instructor:instructors(name)), prices(amount_minor, currency, is_active), lessons(id)").order("sort_order").order("created_at"),
    db.from("enrollments").select("course_id").is("revoked_at", null),
  ]);
  const counts = new Map<string, number>();
  (enrolls ?? []).forEach((e) => counts.set(e.course_id, (counts.get(e.course_id) ?? 0) + 1));

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-bold text-primary">Courses</h1>
        <Link href="/admin/bundles" className="text-sm underline">Bundles</Link>
      </div>

      <Card title="Create a course">
        <form action={createCourseDraft} className="flex flex-wrap items-end gap-3">
          <label className="grid min-w-64 flex-1 gap-1 text-sm font-medium">Course title<input name="title" required placeholder="e.g. Corporate Valuation Fundamentals" className="fc-input" /></label>
          <button className="fc-btn fc-btn-primary">Create &amp; start building</button>
        </form>
        <p className="mt-2 text-xs text-muted">The course starts as a draft. Add details, price, instructor and lessons, then publish when it&apos;s ready.</p>
      </Card>

      <div className="fc-card overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="text-left text-muted"><tr>
            {["Course", "Instructor", "Price", "Lessons", "Students", "Status", ""].map((h) => <th key={h} className="p-3 font-medium">{h}</th>)}
          </tr></thead>
          <tbody>
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {(courses ?? []).map((c: any) => {
              const p = (c.prices ?? []).find((x: { is_active: boolean }) => x.is_active);
              return (
                <tr key={c.id} className="border-t border-line">
                  <td className="p-3">
                    <Link href={`/admin/courses/${c.id}`} className="flex items-center gap-3 font-medium hover:underline">
                      <span className="h-9 w-16 shrink-0 overflow-hidden rounded bg-surface">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        {c.thumbnail_url && <img src={c.thumbnail_url} alt="" className="h-full w-full object-cover" />}
                      </span>
                      {c.title}
                    </Link>
                  </td>
                  <td className="p-3">{c.course_instructors?.map((ci: { instructor: { name: string } }) => ci.instructor?.name).join(", ") || "—"}</td>
                  <td className="p-3">{p ? (p.amount_minor ? formatMoney(p.amount_minor, p.currency) : "Free") : "—"}</td>
                  <td className="p-3 tabular-nums">{c.lessons?.length ?? 0}</td>
                  <td className="p-3 tabular-nums">{counts.get(c.id) ?? 0}</td>
                  <td className="p-3"><span className={`rounded-button px-2 py-0.5 text-xs font-semibold ${statusStyle[c.status]}`}>{c.status}</span></td>
                  <td className="p-3 text-right"><Link href={`/admin/courses/${c.id}`} className="fc-btn fc-btn-outline !px-3 !py-1 text-xs">Edit</Link></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
