import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured, env } from "@/lib/env";
import { demoCatalog } from "@/lib/demo-catalog";
import { isThinkificAsset } from "@/lib/assets";

/** Old Thinkific CDN links no longer resolve (AccessDenied): treat them as "no image" so pages fall back cleanly. */
const img = (u: string | null | undefined) => (u && !isThinkificAsset(u) ? u : null);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const cleanInstructor = (i: any) => (i ? { ...i, photo_url: img(i.photo_url), org_logo_url: img(i.org_logo_url) } : i);

export type Instructor = {
  id: string;
  slug: string;
  name: string;
  title: string | null;
  bio: string | null;
  photo_url: string | null;
  org_logo_url: string | null;
};

export type Price = {
  id: string;
  type: "free" | "one_time" | "subscription" | "payment_plan";
  currency: string;
  amount_minor: number;
  compare_at_minor: number | null;
  interval: string | null;
  installments: number | null;
};

export type LessonSummary = {
  id: string;
  title: string;
  type: string;
  position: number;
  is_preview: boolean;
  duration_seconds: number;
  starts_at?: string | null;
  live_minutes?: number | null;
};

export type Chapter = { id: string; title: string; position: number; lessons: LessonSummary[] };

export type CourseCard = {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  thumbnail_url: string | null;
  duration_minutes: number;
  category: string | null;
  level: string | null;
  /** Start times of live (Zoom) sessions, oldest first; empty for recorded-only courses */
  liveSessions: string[];
  instructors: Instructor[];
  price: Price | null;
  isFree: boolean;
};

export type CourseDetail = CourseCard & { chapters: Chapter[]; access_days: number | null; certificate_enabled: boolean; highlights: string[] };

export type BundleCard = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  thumbnail_url: string | null;
  price: Price | null;
  isFree: boolean;
  courses: CourseCard[];
  totalMinutes: number;
};

const COURSE_SELECT = `id, slug, title, subtitle, description, thumbnail_url, duration_minutes, access_days, certificate_enabled, level,
  sort_order, is_featured, live_lessons:lessons(starts_at),
  category:categories(name),
  course_instructors(is_primary, instructor:instructors(id, slug, name, title, bio, photo_url, org_logo_url)),
  prices(id, type, currency, amount_minor, compare_at_minor, interval, installments, is_active)`;

/* eslint-disable @typescript-eslint/no-explicit-any */
export function pickPrice(prices: any[] | null | undefined, currency = env.defaultCurrency): Price | null {
  const active = (prices ?? []).filter((p) => p.is_active !== false);
  return active.find((p) => p.currency === currency && p.type === "one_time")
    ?? active.find((p) => p.currency === currency)
    ?? active[0]
    ?? null;
}

function toCourseCard(row: any): CourseCard {
  const price = pickPrice(row.prices);
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    subtitle: row.subtitle ?? null,
    description: row.description ?? null,
    thumbnail_url: img(row.thumbnail_url),
    duration_minutes: row.duration_minutes ?? 0,
    category: row.category?.name ?? null,
    level: row.level ?? null,
    liveSessions: (row.live_lessons ?? []).map((l: { starts_at: string | null }) => l.starts_at).filter(Boolean).sort(),
    instructors: (row.course_instructors ?? [])
      .sort((a: any, b: any) => Number(b.is_primary) - Number(a.is_primary))
      .map((ci: any) => cleanInstructor(ci.instructor))
      .filter(Boolean),
    price,
    isFree: !price || price.amount_minor === 0,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export const getCourses = cache(async (opts: { featured?: boolean; free?: boolean } = {}): Promise<CourseCard[]> => {
  if (!isSupabaseConfigured) {
    return demoCatalog.courses.filter((c) => (opts.free === undefined ? true : c.isFree === opts.free));
  }
  const supabase = await createClient();
  let q = supabase.from("courses").select(COURSE_SELECT).eq("status", "published").order("sort_order");
  if (opts.featured) q = q.eq("is_featured", true);
  const { data, error } = await q;
  if (error) throw error;
  const cards = (data ?? []).map(toCourseCard);
  return opts.free === undefined ? cards : cards.filter((c) => c.isFree === opts.free);
});

export const getCourse = cache(async (slug: string): Promise<CourseDetail | null> => {
  if (!isSupabaseConfigured) return demoCatalog.courseDetail(slug);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("courses")
    .select(`${COURSE_SELECT}, highlights, chapters(id, title, position, lessons(id, title, type, position, is_preview, duration_seconds, starts_at, live_minutes))`)
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    ...toCourseCard(data),
    access_days: data.access_days,
    certificate_enabled: data.certificate_enabled,
    highlights: (data as { highlights?: string[] }).highlights ?? [],
    chapters: (data.chapters ?? [])
      .sort((a, b) => a.position - b.position)
      .map((ch) => ({ ...ch, lessons: (ch.lessons ?? []).sort((a, b) => a.position - b.position) })),
  };
});

export const getBundles = cache(async (): Promise<BundleCard[]> => {
  if (!isSupabaseConfigured) return demoCatalog.bundles;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bundles")
    .select(`id, slug, title, description, thumbnail_url, sort_order,
             prices(id, type, currency, amount_minor, compare_at_minor, interval, installments, is_active),
             bundle_courses(position, course:courses(${COURSE_SELECT}))`)
    .eq("status", "published")
    .order("sort_order");
  if (error) throw error;
  return (data ?? []).map((b) => {
    const price = pickPrice(b.prices);
    const courses = (b.bundle_courses ?? [])
      .sort((x, y) => x.position - y.position)
      .map((bc) => bc.course)
      .filter(Boolean)
      .map(toCourseCard);
    return {
      id: b.id,
      slug: b.slug,
      title: b.title,
      description: b.description,
      thumbnail_url: img(b.thumbnail_url),
      price,
      isFree: !price || price.amount_minor === 0,
      courses,
      totalMinutes: courses.reduce((s, c) => s + c.duration_minutes, 0),
    };
  });
});

export const getBundle = cache(async (slug: string) => (await getBundles()).find((b) => b.slug === slug) ?? null);

export const getInstructors = cache(async (): Promise<Instructor[]> => {
  if (!isSupabaseConfigured) return demoCatalog.instructors;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("instructors")
    .select("id, slug, name, title, bio, photo_url, org_logo_url")
    .eq("is_published", true)
    .order("sort_order");
  if (error) throw error;
  return (data ?? []).map(cleanInstructor);
});

/** One instructor with their published courses and total lesson count (for the instructor page). */
export const getInstructor = cache(async (slug: string) => {
  const person = (await getInstructors()).find((i) => i.slug === slug);
  if (!person) return null;
  const courses = (await getCourses()).filter((c) => c.instructors.some((i) => i.id === person.id));
  let lessons = 0;
  for (const c of courses) {
    const d = await getCourse(c.slug);
    lessons += d?.chapters.reduce((n, ch) => n + ch.lessons.length, 0) ?? 0;
  }
  return { person, courses, lessons };
});

export { formatDuration } from "@/lib/format";
