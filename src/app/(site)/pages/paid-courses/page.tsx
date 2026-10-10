import type { Metadata } from "next";
import { getCourses } from "@/lib/catalog";
import { CourseListPage } from "@/components/site/CourseListPage";

export const metadata: Metadata = { title: "All Courses" };

export default async function PaidCoursesPage() {
  return <CourseListPage title="All Courses" courses={await getCourses({ free: false })} />;
}
