import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatMoney } from "@/lib/money";
import { Card } from "@/components/dash/Stat";
import { createCourse, setCourseStatus } from "../actions";

export const metadata: Metadata = { title: "Courses" };

export default async function AdminCourses() {
  await requireRole(["admin"], "/admin/courses");
  const db = createAdminClient();
  const [{ data: courses }, { data: instructors }, { data: enrolls }] = await Promise.all([
    db.from("courses").select("id, slug, title, status, course_instructors(instructor:instructors(name)), prices(amount_minor, currency, is_active)").order("created_at"),
    db.from("instructors").select("id, name").order("sort_order"),
    db.from("enrollments").select("course_id").is("revoked_at", null),
  ]);
  const counts = new Map<string, number>();
  (enrolls ?? []).forEach((e) => counts.set(e.course_id, (counts.get(e.course_id) ?? 0) + 1));

  return (
    <div className="grid gap-6">
      <h1 className="text-3xl font-bold text-primary">Courses</h1>
      <div className="fc-card overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="text-left text-muted"><tr>
            {["Course", "Instructor", "Price", "Students", "Status", ""].map((h) => <th key={h} className="p-3 font-medium">{h}</th>)}
          </tr></thead>
          <tbody>
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {(courses ?? []).map((c: any) => {
              const p = (c.prices ?? []).find((x: { is_active: boolean }) => x.is_active);
              return (
                <tr key={c.id} className="border-t border-line">
                  <td className="p-3 font-medium">{c.title}</td>
                  <td className="p-3">{c.course_instructors?.map((ci: { instructor: { name: string } }) => ci.instructor?.name).join(", ") || "—"}</td>
                  <td className="p-3">{p ? (p.amount_minor ? formatMoney(p.amount_minor, p.currency) : "Free") : "—"}</td>
                  <td className="p-3 tabular-nums">{counts.get(c.id) ?? 0}</td>
                  <td className="p-3">
                    <form className="flex gap-1">
                      {(["draft", "published", "archived"] as const).map((s) => (
                        <button key={s} formAction={setCourseStatus.bind(null, c.id, s)}
                          className={`rounded-button px-2 py-0.5 text-xs ${c.status === s ? "bg-primary text-white" : "border border-line"}`}>{s}</button>
                      ))}
                    </form>
                  </td>
                  <td className="p-3 text-right"><Link href={`/instructor/courses/${c.id}`} className="underline">Curriculum &amp; progress</Link></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Card title="New course">
        <form action={createCourse} className="grid gap-3 md:grid-cols-2">
          <label className="grid gap-1 text-sm font-medium">Title<input name="title" required className="fc-input" /></label>
          <label className="grid gap-1 text-sm font-medium">URL slug (optional)<input name="slug" className="fc-input" placeholder="auto from title" /></label>
          <label className="grid gap-1 text-sm font-medium">Instructor
            <select name="instructor_id" className="fc-input"><option value="">—</option>{(instructors ?? []).map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</select>
          </label>
          <div className="grid grid-cols-[1fr_100px] gap-2">
            <label className="grid gap-1 text-sm font-medium">Price (0 = free)<input name="price" type="number" step="0.01" min="0" defaultValue="0" className="fc-input" /></label>
            <label className="grid gap-1 text-sm font-medium">Currency<input name="currency" defaultValue="AED" maxLength={3} className="fc-input uppercase" /></label>
          </div>
          <button className="fc-btn fc-btn-primary justify-self-start">Create as draft</button>
        </form>
      </Card>
    </div>
  );
}
