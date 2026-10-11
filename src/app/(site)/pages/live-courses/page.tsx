import type { Metadata } from "next";
import { getCourses } from "@/lib/catalog";
import { CourseListPage } from "@/components/site/CourseListPage";
import { sessionNotOver } from "@/lib/format";

export const metadata: Metadata = { title: "Live Courses", description: "Live workshops and masterclasses on Zoom, with recordings included." };

/** Courses with live Zoom sessions: ones with an upcoming session first (soonest first), then past ones (recordings). */
export default async function LiveCoursesPage() {
  const live = (await getCourses()).filter((c) => c.liveSessions.length > 0);
  const next = (c: (typeof live)[number]) => c.liveSessions.find((t) => sessionNotOver(t, 180)) ?? null;
  live.sort((a, b) => {
    const na = next(a), nb = next(b);
    if (na && nb) return na.localeCompare(nb);
    return na ? -1 : nb ? 1 : 0;
  });
  return <CourseListPage title="Live Courses" courses={live}
    chips={["Live on Zoom", "Recordings included", ...(live.some((c) => c.certificate) ? ["Certificates available"] : [])]} />;
}
