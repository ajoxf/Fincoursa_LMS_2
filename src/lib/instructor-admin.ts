import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadEarnings, monthKey, type Earning } from "@/lib/instructor-statement";

/** Has the instructor been invited, accepted (signed in) and when were they last on the portal? */
export type InstructorAccess = {
  state: "no_login" | "invited" | "active";
  email: string | null;
  invitedAt: string | null;      // last invitation email
  firstSignIn: string | null;    // approximate: account confirmed / first seen
  lastSignIn: string | null;
};

export async function instructorAccess(db: SupabaseClient, userId: string | null): Promise<InstructorAccess> {
  if (!userId) return { state: "no_login", email: null, invitedAt: null, firstSignIn: null, lastSignIn: null };
  const [{ data: auth }, { data: invites }] = await Promise.all([
    db.auth.admin.getUserById(userId),
    db.from("email_log").select("created_at, template").in("template", ["instructor_invite", "instructor_invite_again"]).like("ref", `${userId}%`).order("created_at", { ascending: false }).limit(1),
  ]);
  const u = auth?.user;
  const last = u?.last_sign_in_at ?? null;
  return {
    state: last ? "active" : "invited",
    email: u?.email ?? null,
    invitedAt: invites?.[0]?.created_at ?? null,
    firstSignIn: last ? (u?.confirmed_at ?? null) : null,
    lastSignIn: last,
  };
}

/** Several instructors at once (for the list page). */
export async function instructorAccessMany(db: SupabaseClient, userIds: (string | null)[]) {
  const out = new Map<string, InstructorAccess>();
  await Promise.all(userIds.filter((x): x is string => Boolean(x)).map(async (id) => out.set(id, await instructorAccess(db, id))));
  return out;
}

/**
 * FinCoursa's side of an instructor's courses: what students paid, what it cost, what the instructor earns, and what
 * FinCoursa keeps. Built from the per-sale statement rows (instructor_earnings), so it matches the instructor's statement.
 */
export type BusinessCourseRow = {
  course_id: string; title: string;
  sales: number; free: number; refunded: number;
  revenue: number; fee: number; partner: number; cashback: number; instructor: number; kept: number;
};

export async function instructorBusiness(db: SupabaseClient, instructorId: string, opts: { month?: string | null; currency: string }) {
  const all = (await loadEarnings(db, { instructorId })).filter((e) => e.currency === opts.currency);
  const rows = opts.month ? all.filter((e) => monthKey(e.created_at) === opts.month) : all;
  const months = [...new Set(all.map((e) => monthKey(e.created_at)))].sort().reverse();
  const by = new Map<string, Earning[]>();
  for (const e of rows) by.set(e.course_id, [...(by.get(e.course_id) ?? []), e]);
  const { data: links } = await db.from("course_instructors").select("course_id, course:courses(title)").eq("instructor_id", instructorId);
  const titles = new Map(((links ?? []) as unknown as { course_id: string; course: { title: string } | null }[]).map((l) => [l.course_id, l.course?.title ?? "Course"]));
  for (const id of titles.keys()) if (!by.has(id)) by.set(id, []);

  const calc = (list: Earning[]) => {
    const live = list.filter((e) => e.status !== "reversed");
    const s = (f: (e: Earning) => number) => live.reduce((a, e) => a + f(e), 0);
    const revenue = s((e) => Number(e.net_revenue_minor));
    const fee = s((e) => Number(e.payment_fee_minor));
    const partner = s((e) => Number(e.partner_minor));
    // FinCoursa's real cost is all the cashback given, not only the part counted against the instructor
    const cashback = s((e) => Number(e.cashback_given_minor || e.cashback_minor));
    const instructor = s((e) => Number(e.amount_minor));
    return {
      sales: live.filter((e) => Number(e.net_revenue_minor) > 0).length,
      free: live.filter((e) => Number(e.net_revenue_minor) === 0).length,
      refunded: list.length - live.length,
      revenue, fee, partner, cashback, instructor, kept: revenue - fee - partner - cashback - instructor,
    };
  };
  const courses: BusinessCourseRow[] = [...by.entries()].map(([course_id, list]) => ({ course_id, title: titles.get(course_id) ?? list[0]?.course?.title ?? "Course", ...calc(list) }))
    .sort((a, b) => b.revenue - a.revenue || a.title.localeCompare(b.title));
  const owed = all.filter((e) => e.status === "pending" || e.status === "approved").reduce((a, e) => a + Number(e.amount_minor), 0);
  const paidOut = all.filter((e) => e.status === "paid").reduce((a, e) => a + Number(e.amount_minor), 0);
  return { total: calc(rows), courses, months, owed, paidOut };
}
