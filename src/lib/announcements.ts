import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export type Announcement = { id: string; title: string; body: string; created_at: string; course: { title: string; slug: string } | null };

/** Latest updates for courses the caller has already checked the student can access. */
export async function announcementsFor(courseIds: string[], limit = 5): Promise<Announcement[]> {
  if (!courseIds.length) return [];
  const { data } = await createAdminClient().from("course_announcements")
    .select("id, title, body, created_at, course:courses(title, slug)").in("course_id", courseIds)
    .order("created_at", { ascending: false }).limit(limit);
  return (data ?? []) as unknown as Announcement[];
}

/** Admin-written text → paragraphs with clickable links (rendered as React, no HTML injection). */
export function linkParts(text: string): { t: string; href?: string }[] {
  const out: { t: string; href?: string }[] = [];
  let last = 0;
  for (const m of text.matchAll(/https?:\/\/[^\s<]+[^\s<.,;:!?)]/g)) {
    if (m.index! > last) out.push({ t: text.slice(last, m.index) });
    out.push({ t: m[0], href: m[0] });
    last = m.index! + m[0].length;
  }
  if (last < text.length) out.push({ t: text.slice(last) });
  return out;
}
