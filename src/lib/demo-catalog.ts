// Demo content used only when Supabase is not configured, so the site can be
// previewed immediately. Mirrors supabase/seed.sql (content from the live fincoursa.com).
import type { BundleCard, CourseCard, CourseDetail, Instructor } from "@/lib/catalog";

const CDN = "https://import.cdn.thinkific.com/1229196/custom_site_themes/id";

const instructors: Instructor[] = [
  { id: "i1", slug: "dean-rogers", name: "Dean Rogers, CMT", title: "President, Kase and Company", bio: null,
    photo_url: `${CDN}/HuQCUF6DRo2ypIjWDair_Gemini_Generated_Image_321uby321uby321u.jpg`,
    org_logo_url: `${CDN}/wOm4PExeRyGOJWdSsf7E_kase_logo_white_1x.png` },
  { id: "i2", slug: "nicholas-roper", name: "Nicholas Roper", title: "Global Wealth Management and Investment Strategy Specialist", bio: null,
    photo_url: `${CDN}/WwKi14m5Sca2Bk3CxERn_Gemini_Generated_Image_timwkqtimwkqtimw.jpg`, org_logo_url: null },
  { id: "i3", slug: "tom-robson", name: "Tom Robson", title: "Head of Sales", bio: null,
    photo_url: `${CDN}/9kOpHoGeRTOjfXYMwm86_Gemini_Generated_Image_grs39mgrs39mgrs3.jpg`,
    org_logo_url: `${CDN}/ukdzLy2HS6eKuc6rzVWx_okx_wordmark_white.png` },
];

const price = (id: string, amount: number) =>
  ({ id, type: "one_time" as const, currency: "USD", amount_minor: amount, compare_at_minor: null, interval: null, installments: null });

const courses: CourseCard[] = [
  { id: "c1", slug: "behavioral-chemistry-of-trading", title: "Behavioral Chemistry of Trading", subtitle: null,
    description: "Explore the psychological and chemical influences that drive trading decisions and behaviour.",
    thumbnail_url: null, duration_minutes: 10, category: "Technical Finance", level: null, instructors: [instructors[1]],
    price: price("p1", 36700), isFree: false },
  { id: "c2", slug: "commodities-market-analysis", title: "Commodities Market Analysis", subtitle: null,
    description: "Analyse commodities markets with the tools and frameworks used by professional traders.",
    thumbnail_url: null, duration_minutes: 10, category: "Technical Finance", level: null, instructors: [instructors[0]],
    price: price("p2", 36700), isFree: false },
  { id: "c3", slug: "technical-analysis-theory-and-history", title: "Technical Analysis: Theory and History", subtitle: null,
    description: "The foundations and history of technical analysis, from its origins to modern practice.",
    thumbnail_url: null, duration_minutes: 10, category: "Technical Finance", level: null, instructors: [instructors[2]],
    price: price("p3", 36700), isFree: false },
];

const bundles: BundleCard[] = [
  { id: "b1", slug: "technical-analysis-track", title: "Technical Analysis Track",
    description: "A structured path through technical analysis, from theory to application.", thumbnail_url: null,
    price: { ...price("pb1", 0), type: "free" }, isFree: true, courses: [courses[2]], totalMinutes: 990 },
];

export const demoCatalog = {
  instructors,
  courses,
  bundles,
  courseDetail(slug: string): CourseDetail | null {
    const c = courses.find((x) => x.slug === slug);
    if (!c) return null;
    return {
      ...c,
      access_days: null,
      certificate_enabled: true,
      chapters: [{ id: `${c.id}-ch1`, title: "Introduction", position: 1, lessons: [
        { id: `${c.id}-l1`, title: "Welcome to the course", type: "video", position: 1, is_preview: true, duration_seconds: 600 },
      ] }],
    };
  },
};
