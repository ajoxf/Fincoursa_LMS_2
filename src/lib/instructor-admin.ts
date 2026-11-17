import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadEarnings, monthKey, type Earning } from "@/lib/instructor-statement";
import { cashbackForEarnings } from "@/lib/cashback-status";

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
  cbUsed: number; cbOpen: number; cbExpired: number; actual: number;
};

export async function instructorBusiness(db: SupabaseClient, instructorId: string, opts: { month?: string | null; currency: string; courseId?: string | null }) {
  const everything = (await loadEarnings(db, { instructorId })).filter((e) => e.currency === opts.currency);
  const all = opts.courseId ? everything.filter((e) => e.course_id === opts.courseId) : everything;
  const rows = opts.month ? all.filter((e) => monthKey(e.created_at) === opts.month) : all;
  // where each sale's cashback stands now: used, still open, expired (instructor share stays as it was at the sale)
  const cb = await cashbackForEarnings(db, all);
  const months = [...new Set(all.map((e) => monthKey(e.created_at)))].sort().reverse();
  const by = new Map<string, Earning[]>();
  for (const e of rows) by.set(e.course_id, [...(by.get(e.course_id) ?? []), e]);
  const { data: links } = await db.from("course_instructors").select("course_id, course:courses(title)").eq("instructor_id", instructorId);
  const titles = new Map(((links ?? []) as unknown as { course_id: string; course: { title: string } | null }[]).map((l) => [l.course_id, l.course?.title ?? "Course"]));
  const courseOptions = [...titles.entries()].map(([id, title]) => ({ id, title })).sort((a, b) => a.title.localeCompare(b.title));
  for (const id of titles.keys()) if (!by.has(id) && (!opts.courseId || id === opts.courseId)) by.set(id, []);

  const calc = (list: Earning[]) => {
    const live = list.filter((e) => e.status !== "reversed");
    const s = (f: (e: Earning) => number) => live.reduce((a, e) => a + f(e), 0);
    const revenue = s((e) => Number(e.net_revenue_minor));
    const fee = s((e) => Number(e.payment_fee_minor));
    const partner = s((e) => Number(e.partner_minor));
    // FinCoursa's real cost is all the cashback given, not only the part counted against the instructor
    const cashback = s((e) => Number(e.cashback_given_minor || e.cashback_minor));
    const instructor = s((e) => Number(e.amount_minor));
    const cbUsed = s((e) => cb.get(e.id)?.used ?? 0);
    const cbOpen = s((e) => cb.get(e.id)?.open ?? 0);
    const cbExpired = s((e) => cb.get(e.id)?.expired ?? 0);
    return {
      sales: live.filter((e) => Number(e.net_revenue_minor) > 0).length,
      free: live.filter((e) => Number(e.net_revenue_minor) === 0).length,
      refunded: list.length - live.length,
      revenue, fee, partner, cashback, instructor, cbUsed, cbOpen, cbExpired,
      // worst case: all cashback given is spent; actual: only the cashback spent so far
      kept: revenue - fee - partner - cashback - instructor,
      actual: revenue - fee - partner - cbUsed - instructor,
    };
  };
  const courses: BusinessCourseRow[] = [...by.entries()].map(([course_id, list]) => ({ course_id, title: titles.get(course_id) ?? list[0]?.course?.title ?? "Course", ...calc(list) }))
    .sort((a, b) => b.revenue - a.revenue || a.title.localeCompare(b.title));
  const owed = all.filter((e) => e.status === "pending" || e.status === "approved").reduce((a, e) => a + Number(e.amount_minor), 0);
  const paidOut = all.filter((e) => e.status === "paid").reduce((a, e) => a + Number(e.amount_minor), 0);
  // chart: each day of the chosen month, or each of the last 12 months (UAE time, like the statement)
  const buckets: { key: string; label: string }[] = [];
  if (opts.month) {
    const [y, mo] = opts.month.split("-").map(Number);
    const daysIn = new Date(Date.UTC(y, mo, 0)).getUTCDate();
    for (let d = 1; d <= daysIn; d++) buckets.push({ key: `${opts.month}-${String(d).padStart(2, "0")}`, label: `${d} ${new Date(Date.UTC(y, mo - 1, 1)).toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" })}` });
  } else {
    const now = new Date(Date.now() + 4 * 3600e3);
    for (let i = 11; i >= 0; i--) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
      buckets.push({ key: d.toISOString().slice(0, 7), label: d.toLocaleDateString("en-GB", { month: "short", year: "2-digit", timeZone: "UTC" }) });
    }
  }
  const keyOf = (e: Earning) => (opts.month ? new Date(new Date(e.created_at).getTime() + 4 * 3600e3).toISOString().slice(0, 10) : monthKey(e.created_at));
  const series = buckets.map((b) => {
    const t = calc(rows.filter((e) => keyOf(e) === b.key));
    return { label: b.label, revenue: t.revenue, kept: t.kept, instructor: t.instructor };
  });
  return { total: calc(rows), courses, months, owed, paidOut, series, courseOptions };
}
