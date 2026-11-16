import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { minorUnitsFactor } from "@/lib/money";
import { filterEarnings, loadEarnings, statementCsv } from "@/lib/instructor-statement";

/** The signed-in instructor's earnings statement as CSV (optionally one course and/or one month). Own sales only (RLS). */
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const course = req.nextUrl.searchParams.get("course");
  const month = req.nextUrl.searchParams.get("month");
  // admins (who can read every instructor's rows) pass the instructor; instructors only ever get their own (RLS)
  const ins = req.nextUrl.searchParams.get("instructor");
  const rows = filterEarnings(await loadEarnings(await createClient(), { instructorId: ins && /^[0-9a-f-]{36}$/i.test(ins) ? ins : undefined }), {
    course: course && /^[0-9a-f-]{36}$/i.test(course) ? course : null,
    month: month && /^\d{4}-\d{2}$/.test(month) ? month : null,
  });
  const name = `fincoursa-earnings${month ? `-${month}` : ""}.csv`;
  return new NextResponse(statementCsv(rows, minorUnitsFactor), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store" },
  });
}
