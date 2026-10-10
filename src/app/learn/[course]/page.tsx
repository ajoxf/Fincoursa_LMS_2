import { notFound, redirect } from "next/navigation";
import { getCourse } from "@/lib/catalog";
import { getEnrollment } from "@/lib/learning";
import { requireUser } from "@/lib/auth";

// Resume where the student left off, else the first lesson.
export default async function LearnIndex({ params }: PageProps<"/learn/[course]">) {
  const { course: slug } = await params;
  await requireUser(`/learn/${slug}`);
  const course = await getCourse(slug);
  if (!course) notFound();
  const enrollment = await getEnrollment(course.id);
  if (!enrollment) redirect(`/courses/${slug}`);
  const first = course.chapters.flatMap((c) => c.lessons)[0];
  const target = enrollment.last_lesson_id ?? first?.id;
  if (!target) redirect(`/courses/${slug}`);
  redirect(`/learn/${slug}/${target}`);
}
