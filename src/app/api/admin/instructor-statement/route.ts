import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser, hasRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { minorUnitsFactor } from "@/lib/money";
import { env } from "@/lib/env";
import { filterEarnings, loadEarnings, monthLabel, statementCsv } from "@/lib/instructor-statement";
import { fetchLogo, statementPdf, statementXlsx } from "@/lib/statement-export";
import { getBranding } from "@/lib/site-settings";
import { EMAIL_THEME } from "@/lib/email/templates";

/** Admin only: an instructor's earnings statement as CSV, Excel or PDF, for one course and/or month if chosen. */
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!hasRole(user, "admin") && !hasRole(user, "finance")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const q = req.nextUrl.searchParams;
  const id = q.get("instructor") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "instructor required" }, { status: 400 });
  const course = q.get("course"), month = q.get("month");
  const format = q.get("format") === "xlsx" ? "xlsx" : q.get("format") === "pdf" ? "pdf" : "csv";
  const db = createAdminClient();
  const { data: ins } = await db.from("instructors").select("name, slug").eq("id", id).maybeSingle();
  if (!ins) return NextResponse.json({ error: "not found" }, { status: 404 });
  const courseId = course && /^[0-9a-f-]{36}$/i.test(course) ? course : null;
  const monthKey = month && /^\d{4}-\d{2}$/.test(month) ? month : null;
  const rows = filterEarnings(await loadEarnings(db, { instructorId: id }), { course: courseId, month: monthKey });
  const courseTitle = courseId ? (await db.from("courses").select("title").eq("id", courseId).maybeSingle()).data?.title : null;
  const meta: Parameters<typeof statementPdf>[1] = {
    instructor: ins.name, currency: rows[0]?.currency ?? env.defaultCurrency,
    scope: [courseTitle, monthKey ? monthLabel(monthKey) : "All time"].filter(Boolean).join(", "),
    generated: new Date().toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Dubai" }) + " (UAE)",
  };
  if (format !== "csv") {
    // the FinCoursa logos uploaded in Admin -> Home page & logos (white falls back to the email logo)
    const b = await getBranding().catch(() => ({} as { logo_white?: string | null; logo_dark?: string | null }));
    const [white, dark] = await Promise.all([fetchLogo(b.logo_white || EMAIL_THEME.logo), fetchLogo(b.logo_dark)]);
    Object.assign(meta, { logoWhite: white, logoDark: dark });
  }
  const base = `fincoursa-statement-${ins.slug ?? "instructor"}${monthKey ? `-${monthKey}` : ""}`;
  const headers = (type: string, ext: string) => ({ "Content-Type": type, "Content-Disposition": `attachment; filename="${base}.${ext}"`, "Cache-Control": "no-store" });
  if (format === "xlsx") return new NextResponse(new Uint8Array(await statementXlsx(rows, meta)), { headers: headers("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "xlsx") });
  if (format === "pdf") return new NextResponse(new Uint8Array(await statementPdf(rows, meta)), { headers: headers("application/pdf", "pdf") });
  return new NextResponse(statementCsv(rows, minorUnitsFactor), { headers: headers("text/csv; charset=utf-8", "csv") });
}
