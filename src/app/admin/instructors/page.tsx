import { assetUrl, isThinkificAsset } from "@/lib/assets";
import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card } from "@/components/dash/Stat";
import { createInstructor, saveInstructorDeductions } from "./actions";
import { agreementStatus } from "@/lib/agreements";

export const metadata: Metadata = { title: "Instructors" };

export default async function AdminInstructors({ searchParams }: PageProps<"/admin/instructors">) {
  await requireRole(["admin"], "/admin/instructors");
  const sp = await searchParams;
  const { data: ded } = await createAdminClient().from("site_settings").select("value").eq("key", "instructor_deductions").maybeSingle();
  const feePct = Number((ded?.value as { payment_fee_pct?: number } | null)?.payment_fee_pct ?? 2.5);
  const { data } = await createAdminClient()
    .from("instructors").select("id, name, title, photo_url, is_published, user_id, default_revenue_share_pct, course_instructors(course_id)").order("sort_order");
  const signed = await agreementStatus("instructor");
  return (
    <div className="grid gap-6">
      <h1 className="text-3xl font-bold text-primary">Instructors</h1>
      {typeof sp.ok === "string" && <p className="rounded-lg bg-success/10 p-3 text-sm text-success">{sp.ok}</p>}
      {typeof sp.err === "string" && <p className="rounded-lg bg-danger/10 p-3 text-sm text-danger">{sp.err}</p>}
      <Card title="How instructor earnings are calculated">
        <div className="grid gap-3 text-sm">
          <p className="text-muted">For each sale: what the student paid (after codes and credit, excluding tax) &minus; payment processing fee &minus; partner commission (when the sale came through a partner) &minus; cashback credit given to the student = amount shared, &times; the instructor&apos;s revenue share. Instructors see this statement for every sale on their dashboard, without student details.</p>
          <form action={saveInstructorDeductions} className="flex flex-wrap items-end gap-3">
            <label className="grid gap-1 font-medium">Payment processing fee (%)
              <input name="payment_fee_pct" defaultValue={feePct} inputMode="decimal" className="fc-input w-28" /></label>
            <button className="fc-btn fc-btn-primary !min-w-0 !px-5 !py-2.5 text-sm">Save</button>
            <span className="text-xs text-muted">Your gateway&apos;s standard rate (Razorpay is about 2% for Indian cards, 3% international). Not charged on free enrolments.</span>
          </form>
        </div>
      </Card>
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
              {i.photo_url && !isThinkificAsset(i.photo_url) && <img src={assetUrl(i.photo_url)} alt="" className="h-full w-full object-cover" />}
            </span>
            <span className="min-w-0 text-sm">
              <span className="block font-semibold">{i.name}</span>
              <span className="block truncate text-muted">{i.title}</span>
              <span className="mt-1 block text-xs text-muted">
                {i.course_instructors?.length ?? 0} courses · {Number(i.default_revenue_share_pct)}% share · {i.user_id ? "login linked" : "no login"} · {i.is_published ? "on site" : "hidden"}
              </span>
              <span className={`mt-1 block text-xs ${signed.get(i.id) === "signed" ? "text-success" : signed.get(i.id) ? "text-warning" : "text-muted"}`}>
                {signed.get(i.id) === "signed" ? "Agreement signed" : signed.get(i.id) ? "Agreement sent, not signed yet" : "No agreement on file"}
              </span>
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
