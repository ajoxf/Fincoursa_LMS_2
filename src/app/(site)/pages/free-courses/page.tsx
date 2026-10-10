import type { Metadata } from "next";
import { getCourses } from "@/lib/catalog";
import { CourseListPage } from "@/components/site/CourseListPage";

export const metadata: Metadata = { title: "Free Courses" };

export default async function FreeCoursesPage() {
  return <CourseListPage title="Free Courses" courses={await getCourses({ free: true })} />;
}
