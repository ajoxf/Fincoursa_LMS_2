import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCourses, getTopics } from "@/lib/catalog";
import { CourseListPage } from "@/components/site/CourseListPage";

/** A topic page (Learn menu): every published course in one category. */
export async function generateMetadata({ params }: PageProps<"/topics/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const t = (await getTopics()).find((x) => x.slug === slug);
  return t ? { title: t.name, description: `${t.name} courses on FinCoursa, taught by practitioners.` } : {};
}

export default async function TopicPage({ params }: PageProps<"/topics/[slug]">) {
  const { slug } = await params;
  const topic = (await getTopics()).find((t) => t.slug === slug);
  if (!topic) notFound();
  const courses = (await getCourses()).filter((c) => c.categorySlug === slug);
  return <CourseListPage title={topic.name} courses={courses} />;
}
