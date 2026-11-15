import { notFound, redirect } from "next/navigation";
import { getCourse } from "@/lib/catalog";
import { getEnrollment } from "@/lib/learning";
import { requireUser } from "@/lib/auth";

// Resume where the student left off, else the first lesson.
export default async function LearnIndex({ params }: PageProps<"/learn/[course]">) {
  const { course: slug } = await params;
  const user = await requireUser(`/learn/${slug}`);
  const course = await getCourse(slug);
  if (!course) notFound();
  const enrollment = await getEnrollment(course.id);
  const visible = course.chapters.flatMap((c) => c.lessons);
  const first = visible[0];
  // Admins and instructors can preview every lesson without enrolling
  if (!enrollment && first && (user.roles.includes("admin") || user.roles.includes("instructor"))) redirect(`/learn/${slug}/${first.id}`);
  if (!enrollment) redirect(`/courses/${slug}`);
  // the last lesson may since have been hidden: then start from the first one
  const target = visible.some((l) => l.id === enrollment.last_lesson_id) ? enrollment.last_lesson_id : first?.id;
  if (!target) redirect(`/courses/${slug}`);
  redirect(`/learn/${slug}/${target}`);
}
