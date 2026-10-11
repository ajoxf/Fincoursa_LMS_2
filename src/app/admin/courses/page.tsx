import { assetUrl, isThinkificAsset } from "@/lib/assets";
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
    db.from("courses").select("id, slug, title, status, thumbnail_url, updated_at, course_instructors(instructor:instructors(name, photo_url)), prices(amount_minor, currency, is_active), lessons(id)").order("sort_order").order("created_at"),
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

      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        {(courses ?? []).map((c: any) => {
          const p = (c.prices ?? []).find((x: { is_active: boolean }) => x.is_active);
          const ins = c.course_instructors?.map((ci: { instructor: { name: string; photo_url: string | null } }) => ci.instructor).filter(Boolean) ?? [];
          const img = c.thumbnail_url ?? ins[0]?.photo_url ?? null;
          return (
            <Link key={c.id} href={`/admin/courses/${c.id}`} className="fc-card group flex flex-col overflow-hidden transition hover:shadow-md">
              <div className="relative aspect-[310/171] overflow-hidden bg-surface">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {img && !isThinkificAsset(img) && <img src={assetUrl(img)} alt="" className="absolute inset-0 h-full w-full object-cover object-top" />}
              </div>
              <div className="flex flex-1 flex-col gap-1 p-4">
                <h2 className="font-semibold leading-snug text-ink group-hover:underline">{c.title}</h2>
                <p className="text-sm text-muted">{ins.map((i: { name: string }) => i.name).join(", ") || "No instructor yet"}</p>
                <p className="text-sm text-muted">
                  {p ? (p.amount_minor ? formatMoney(p.amount_minor, p.currency) : "Free") : "No price"} · {c.lessons?.length ?? 0} lessons · {counts.get(c.id) ?? 0} students
                </p>
                <span className={`mt-3 self-start rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${statusStyle[c.status]}`}>{c.status}</span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
