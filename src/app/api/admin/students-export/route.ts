import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser, hasRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseStudentFilters, searchStudents, spendFor } from "@/lib/students";
import { minorUnitsFactor } from "@/lib/money";

/** CSV of the student directory with the same filters as the Students page. Staff only; every export is logged. */
export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user || !(hasRole(user, "admin") || hasRole(user, "finance") || hasRole(user, "support"))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const f = parseStudentFilters(Object.fromEntries(request.nextUrl.searchParams));
  const { rows } = await searchStudents(f, 100000, 0);
  const db = createAdminClient();

  // course titles per student and spend, in chunks to keep requests small
  const titles = new Map<string, string[]>();
  const spend = new Map<string, Record<string, number>>();
  for (let i = 0; i < rows.length; i += 200) {
    const ids = rows.slice(i, i + 200).map((r) => r.id);
    const [{ data: enr }, s] = await Promise.all([
      db.from("enrollments").select("user_id, course:courses(title)").in("user_id", ids).is("revoked_at", null),
      spendFor(ids),
    ]);
    for (const e of enr ?? []) {
      /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
      const t = (e.course as any)?.title; if (t) titles.set(e.user_id, [...(titles.get(e.user_id) ?? []), t]);
    }
    s.forEach((v, k) => spend.set(k, v));
  }

  // spreadsheet-safe: values starting with = + - @ are prefixed so they are never run as formulas
  const cell = (v: unknown) => {
    let s = v === null || v === undefined ? "" : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = ["Name", "Email", "Country", "Joined", "Last sign-in", "Last active", "Active courses", "Completed courses", "Paid orders", "Total spent", "Marketing emails", "Roles", "Courses"];
  const lines = [head.join(",")];
  for (const r of rows) {
    const sp = Object.entries(spend.get(r.id) ?? {}).filter(([, v]) => v > 0).map(([c, v]) => `${c} ${(v / minorUnitsFactor(c)).toFixed(2)}`).join(" + ");
    lines.push([r.full_name, r.email, r.country_code, r.created_at?.slice(0, 10), r.last_sign_in_at?.slice(0, 10), r.last_activity_at?.slice(0, 10),
      r.active_courses, r.completed_courses, r.paid_orders, sp, r.marketing_opt_in ? "yes" : "no", (r.roles ?? []).join(" "), (titles.get(r.id) ?? []).join("; ")].map(cell).join(","));
  }
  await db.from("audit_log").insert({ actor_id: user.id, action: "students.exported", entity: "profiles", entity_id: null, data: { rows: rows.length, filters: f } });

  return new NextResponse("﻿" + lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="fincoursa-students-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
