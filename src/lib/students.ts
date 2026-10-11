import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export type StudentRow = {
  id: string; email: string; full_name: string | null; country_code: string | null; marketing_opt_in: boolean;
  created_at: string; last_sign_in_at: string | null; last_activity_at: string | null;
  active_courses: number; completed_courses: number; paid_orders: number; roles: string[] | null; total: number;
};

export type StudentFilters = { q: string; course: string; country: string; consent: "" | "yes" | "no"; sort: "new" | "active" | "name" };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export function parseStudentFilters(sp: Record<string, string | string[] | undefined>): StudentFilters & { page: number } {
  const consent = one(sp.consent);
  const sort = one(sp.sort);
  const course = one(sp.course);
  return {
    q: one(sp.q).trim().slice(0, 100),
    course: /^[0-9a-f-]{36}$/i.test(course) ? course : "",
    country: one(sp.country).toUpperCase().replace(/[^A-Z]/g, "").slice(0, 2),
    consent: consent === "yes" || consent === "no" ? consent : "",
    sort: sort === "active" || sort === "name" ? sort : "new",
    page: Math.max(1, Math.floor(Number(one(sp.page)) || 1)),
  };
}

/** Search the student directory. LIKE wildcards in the search text are matched literally. */
export async function searchStudents(f: StudentFilters, limit: number, offset: number) {
  const q = f.q.replace(/[\\%_]/g, (c) => `\\${c}`);
  const { data, error } = await createAdminClient().rpc("admin_student_search", {
    p_q: q || null, p_course: f.course || null, p_country: f.country || null,
    p_consent: f.consent === "" ? null : f.consent === "yes", p_sort: f.sort, p_limit: limit, p_offset: offset,
  });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as StudentRow[];
  return { rows, total: rows[0] ? Number(rows[0].total) : 0 };
}

/** Lifetime spend per currency for a set of users (net of refunds). */
export async function spendFor(userIds: string[]) {
  const out = new Map<string, Record<string, number>>();
  if (!userIds.length) return out;
  const { data } = await createAdminClient().from("orders")
    .select("user_id, currency, total_minor, refunded_minor, status")
    .in("user_id", userIds).in("status", ["paid", "partially_refunded", "refunded"]);
  for (const o of data ?? []) {
    const m = out.get(o.user_id) ?? {};
    m[o.currency] = (m[o.currency] ?? 0) + Number(o.total_minor) - Number(o.refunded_minor ?? 0);
    out.set(o.user_id, m);
  }
  return out;
}

export const filtersToQuery = (f: Partial<StudentFilters & { page: number }>) =>
  new URLSearchParams(Object.entries(f).filter(([, v]) => v !== "" && v !== undefined && v !== 1 && v !== "new").map(([k, v]) => [k, String(v)])).toString();
