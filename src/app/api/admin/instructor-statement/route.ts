import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser, hasRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { env } from "@/lib/env";
import { filterEarnings, loadEarnings, monthLabel } from "@/lib/instructor-statement";
import { fetchLogo, fincoursaCsv, fincoursaPdf, fincoursaXlsx, instructorCsv, instructorPdf, instructorXlsx } from "@/lib/statement-export";
import { cashbackForEarnings } from "@/lib/cashback-status";
import { getBranding } from "@/lib/site-settings";
import { EMAIL_THEME } from "@/lib/email/templates";

/**
 * Admin only, for one instructor, as Excel, CSV or PDF, for the course and/or month chosen:
 * - view=instructor: the Instructor Earnings Statement, only what applies to the instructor (safe to send to them);
 * - otherwise: the FinCoursa Margin Statement (FinCoursa View), internal, never for the instructor.
 */
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!hasRole(user, "admin")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
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
  const rows = filterEarnings(await loadEarnings(db, { instructorId: id }), { course: courseId, month: monthKey }).filter((e) => e.currency === (q.get("currency") || env.defaultCurrency));
  const forInstructor = q.get("view") === "instructor";
  const cb = forInstructor ? new Map() : await cashbackForEarnings(db, rows);
  const courseTitle = courseId ? (await db.from("courses").select("title").eq("id", courseId).maybeSingle()).data?.title : null;
  const meta: Parameters<typeof fincoursaPdf>[1] = {
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
  const base = `${forInstructor ? "instructor-earnings-statement" : "fincoursa-margin-statement-internal"}-${ins.slug ?? "instructor"}${monthKey ? `-${monthKey}` : ""}`;
  const headers = (type: string, ext: string) => ({ "Content-Type": type, "Content-Disposition": `attachment; filename="${base}.${ext}"`, "Cache-Control": "no-store" });
  if (forInstructor) {
    if (format === "xlsx") return new NextResponse(new Uint8Array(await instructorXlsx(rows, meta)), { headers: headers("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "xlsx") });
    if (format === "pdf") return new NextResponse(new Uint8Array(await instructorPdf(rows, meta)), { headers: headers("application/pdf", "pdf") });
    return new NextResponse(instructorCsv(rows), { headers: headers("text/csv; charset=utf-8", "csv") });
  }
  if (format === "xlsx") return new NextResponse(new Uint8Array(await fincoursaXlsx(rows, meta, cb)), { headers: headers("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "xlsx") });
  if (format === "pdf") return new NextResponse(new Uint8Array(await fincoursaPdf(rows, meta, cb)), { headers: headers("application/pdf", "pdf") });
  return new NextResponse(fincoursaCsv(rows, cb), { headers: headers("text/csv; charset=utf-8", "csv") });
}
