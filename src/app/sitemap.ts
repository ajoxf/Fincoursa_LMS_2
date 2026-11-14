import type { MetadataRoute } from "next";
import { env } from "@/lib/env";
import { getBundles, getCourses, getInstructors } from "@/lib/catalog";

export const revalidate = 3600;

/** Public pages for search engines: the catalogue, every published course, programme and instructor. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = env.siteUrl.replace(/\/$/, "");
  const fixed = ["", "/pages/paid-courses", "/pages/free-courses", "/pages/live-courses", "/pages/instructors",
    "/pages/contact-us", "/pages/terms-conditions", "/pages/privacy-policy"];
  const [courses, bundles, instructors] = await Promise.all([
    getCourses().catch(() => []), getBundles().catch(() => []), getInstructors().catch(() => []),
  ]);
  return [
    ...fixed.map((p) => ({ url: `${base}${p}`, changeFrequency: "weekly" as const, priority: p === "" ? 1 : 0.6 })),
    ...courses.map((c) => ({ url: `${base}/courses/${c.slug}`, changeFrequency: "weekly" as const, priority: 0.9 })),
    ...(bundles.length ? [{ url: `${base}/pages/bundles`, priority: 0.6 }] : []),
    ...bundles.map((b) => ({ url: `${base}/bundles/${b.slug}`, changeFrequency: "weekly" as const, priority: 0.8 })),
    ...instructors.map((i) => ({ url: `${base}/instructors/${i.slug}`, changeFrequency: "monthly" as const, priority: 0.5 })),
  ];
}
