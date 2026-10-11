import { assetUrl } from "@/lib/assets";
import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card } from "@/components/dash/Stat";
import { createInstructor } from "./actions";

export const metadata: Metadata = { title: "Instructors" };

export default async function AdminInstructors() {
  await requireRole(["admin"], "/admin/instructors");
  const { data } = await createAdminClient()
    .from("instructors").select("id, name, title, photo_url, is_published, user_id, default_revenue_share_pct, course_instructors(course_id)").order("sort_order");
  return (
    <div className="grid gap-6">
      <h1 className="text-3xl font-bold text-primary">Instructors</h1>
      <Card title="Add an instructor">
        <form action={createInstructor} className="flex flex-wrap items-end gap-3">
          <label className="grid min-w-64 flex-1 gap-1 text-sm font-medium">Full name (as shown on the site)<input name="name" required className="fc-input" /></label>
          <button className="fc-btn fc-btn-primary">Add instructor</button>
        </form>
      </Card>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        {(data ?? []).map((i: any) => (
          <Link key={i.id} href={`/admin/instructors/${i.id}`} className="fc-card flex gap-4 p-4 hover:shadow-md">
            <span className="h-16 w-16 shrink-0 overflow-hidden rounded-full bg-surface">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {i.photo_url && <img src={assetUrl(i.photo_url)} alt="" className="h-full w-full object-cover" />}
            </span>
            <span className="min-w-0 text-sm">
              <span className="block font-semibold">{i.name}</span>
              <span className="block truncate text-muted">{i.title}</span>
              <span className="mt-1 block text-xs text-muted">
                {i.course_instructors?.length ?? 0} courses · {Number(i.default_revenue_share_pct)}% share · {i.user_id ? "login linked" : "no login"} · {i.is_published ? "on site" : "hidden"}
              </span>
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
