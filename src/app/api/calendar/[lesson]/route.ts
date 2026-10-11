import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";

const ics = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const fold = (s: string) => s.replace(/[\\;,]/g, (c) => `\\${c}`).replace(/\n/g, "\\n");

/**
 * Calendar invite for a live session. The event links to the lesson page (which shows the Zoom
 * button at the right time), so the Zoom link itself never sits in people's calendars.
 */
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/calendar/[lesson]">) {
  const { lesson: id } = await ctx.params;
  if (!(await getSessionUser())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const supabase = await createClient();
  const { data: unlocked } = await supabase.rpc("lesson_unlocked", { p_lesson: id });
  if (!unlocked) return NextResponse.json({ error: "not found" }, { status: 404 });
  const { data: l } = await supabase.from("lessons")
    .select("id, title, starts_at, live_minutes, course:courses(title, slug)").eq("id", id).maybeSingle();
  if (!l?.starts_at) return NextResponse.json({ error: "not found" }, { status: 404 });
  const course = (Array.isArray(l.course) ? l.course[0] : l.course) as { title: string; slug: string } | null;
  const start = new Date(l.starts_at);
  const end = new Date(start.getTime() + (l.live_minutes ?? 60) * 60000);
  const url = `${env.siteUrl}/learn/${course?.slug}/${l.id}`;

  const body = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//FinCoursa//Live sessions//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${l.id}@fincoursa.com`, `DTSTAMP:${ics(new Date())}`, `DTSTART:${ics(start)}`, `DTEND:${ics(end)}`,
    `SUMMARY:${fold(`${course?.title ?? "FinCoursa"}: ${l.title}`)}`,
    `DESCRIPTION:${fold(`Live on Zoom. Join from your FinCoursa account 15 minutes before the start:\n${url}`)}`,
    `URL:${url}`, "LOCATION:Zoom (link in your FinCoursa account)",
    "BEGIN:VALARM", "TRIGGER:-PT30M", "ACTION:DISPLAY", "DESCRIPTION:Masterclass starts in 30 minutes", "END:VALARM",
    "END:VEVENT", "END:VCALENDAR",
  ].join("\r\n");
  return new NextResponse(body, {
    headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": `attachment; filename="fincoursa-session.ics"` },
  });
}
