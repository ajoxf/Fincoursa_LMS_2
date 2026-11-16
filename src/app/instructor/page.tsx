import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { MyAgreements } from "@/components/dash/MyAgreements";
import { createClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import { loadEarnings } from "@/lib/instructor-statement";
import { InstructorDashboardView, type InstructorCourseRow } from "@/components/dash/InstructorDashboardView";

export const metadata: Metadata = { title: "Instructor dashboard" };

export default async function InstructorDashboard({ searchParams }: PageProps<"/instructor">) {
  const me = await requireRole(["instructor"], "/instructor");
  const sp = await searchParams;
  const days = Math.min(365, Math.max(7, Number(sp.days) || 30));
  const cur = env.defaultCurrency;
  const supabase = await createClient();
  const [{ data: summary, error }, { data: series }, { data: payouts }] = await Promise.all([
    supabase.rpc("instructor_summary", { p_currency: cur }),
    supabase.rpc("instructor_earnings_series", { p_days: days, p_currency: cur }),
    supabase.from("payouts").select("id, amount_minor, currency, status, paid_at, created_at, reference").eq("payee_type", "instructor").order("created_at", { ascending: false }).limit(10),
  ]);
  // the revenue share the admin set: per course, else the instructor's default
  const { data: me2 } = await supabase.from("instructors").select("id, default_revenue_share_pct").eq("user_id", me.id).maybeSingle();
  const { data: links } = me2 ? await supabase.from("course_instructors").select("course_id, revenue_share_pct").eq("instructor_id", me2.id) : { data: [] as { course_id: string; revenue_share_pct: number | null }[] };
  const shareFor = (courseId: string) => {
    const l = (links ?? []).find((x) => x.course_id === courseId);
    return Number(l?.revenue_share_pct ?? me2?.default_revenue_share_pct ?? 0);
  };
  // each sale behind the earnings: no student names or emails, only what the sale was worth and the share
  const earnings = await loadEarnings(supabase);
  if (error) return <p className="text-danger">Your instructor profile isn&apos;t linked yet. Ask an admin to connect it to your account.</p>;
  const courses = ((summary.courses ?? []) as Omit<InstructorCourseRow, "share">[]).map((c) => ({ ...c, share: shareFor(c.course_id) }));
  return (
    <div className="grid gap-6">
      <InstructorDashboardView basePath="/instructor" sp={{ course: typeof sp.course === "string" ? sp.course : null, month: typeof sp.month === "string" ? sp.month : null }}
        d={{ currency: cur, days, pending_minor: Number(summary.pending_minor), approved_minor: Number(summary.approved_minor), paid_minor: Number(summary.paid_minor),
          series: (series ?? []) as { day: string; amount_minor: number }[], courses, earnings, payouts: payouts ?? [] }} />
      <MyAgreements userId={me.id} />
    </div>
  );
}
