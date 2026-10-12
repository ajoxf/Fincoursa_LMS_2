// Home page wording, editable by an admin in Admin → Home page & logos → Home page text.
// The defaults are the original wording; a blank field falls back to its default. Safe in the browser.

export type OrgTab = { label: string; title: string; bullets: string[] };
export type FaqItem = { q: string; a: string };

export const HOME_DEFAULTS = {
  hero_title: "Real-World Expertise for the Future of Business",
  hero_sub: "Learn from industry practitioners. Build skills that work in the real world.",
  hero_button: "Browse Course",
  hero_button2: "Meet the faculty",
  experts_label: "Industry experts",
  growth_label: "Built for growth",
  growth_title: "Turn knowledge into real returns.",
  growth_body: "Every FinCoursa course is built to move a number that matters — your income, your next role, your portfolio. Practical, high-leverage skills from people who've actually done it, not theory.",
  live_label: "Live on Zoom",
  live_title: "Upcoming live workshops",
  live_sub: "Learn live with the faculty, ask your questions, and keep the recordings in your account.",
  paths_label: "Programmes",
  paths_title: "Structured tracks, not scattered videos.",
  paths_button: "View all programmes",
  catalog_label: "Catalog",
  catalog_title: "Featured Courses",
  catalog_sub: "A hand-picked place to start — pay per course, own it for life.",
  catalog_button: "View all courses",
  faculty_label: "The Faculty",
  faculty_title: "Learn from practitioners.",
  faculty_sub: "Industry leaders who have built and run real money — now teaching exactly what worked.",
  faculty_button: "View All Faculties",
  org_label: "For Organizations",
  org_title: "Corporate, university & custom training.",
  org_sub: "Bring FinCoursa to your team, business school, or training program — with seat licensing, analytics, accredited tracks, and curriculum built around your goals.",
  org_box_title: "Bring FinCoursa to your organization.",
  org_box_body: "Corporate, university or fully custom — tell us your goals and we'll scope a program that fits. One conversation, one team to work with.",
  org_box_button: "Talk to our Team",
  org_tabs: [
    { label: "Corporate training", title: "Upskill analysts, associates and whole teams at scale.",
      bullets: ["Volume seat licensing", "Team analytics & progress", "SSO & admin controls", "Dedicated success manager"] },
    { label: "University & academic", title: "Give students practical skills that prepare them for the future.",
      bullets: ["Flexible student licensing", "Progress tracking", "Academic dashboards", "Faculty support"] },
    { label: "Custom programs", title: "Build a learning experience tailored to your organization.",
      bullets: ["Custom learning paths", "Branded programs", "Custom reporting", "Dedicated program support"] },
  ] as OrgTab[],
  faq: [
    { q: "Can I buy just one course?", a: "Yes — that's how FinCoursa works by default. Open any course and enroll directly, or choose a programme to get a set of courses at one price. No subscription required." },
    { q: "Do I need a specific background?", a: "No specific background is required. Our courses are designed for learners with different levels of experience." },
    { q: "Do you offer team or university pricing?", a: "Yes. We offer flexible pricing options for teams, universities, and other organizations." },
    { q: "What if a course isn’t right for me?", a: "If a course doesn't meet your expectations, please contact our support team and we'll help you find the right option." },
  ] as FaqItem[],
};

export type HomeContent = typeof HOME_DEFAULTS;
export type HomeTextKey = Exclude<keyof HomeContent, "org_tabs" | "faq">;

/** The editable single-text fields, grouped the way they appear on the page (top to bottom). */
export const HOME_SECTIONS: { title: string; fields: { key: HomeTextKey; label: string; long?: boolean }[] }[] = [
  { title: "Hero (top of the page)", fields: [
    { key: "hero_title", label: "Headline", long: true },
    { key: "hero_sub", label: "Text next to the headline", long: true },
    { key: "hero_button", label: "Main button" },
    { key: "hero_button2", label: "Second button" },
  ] },
  { title: "Industry experts strip", fields: [{ key: "experts_label", label: "Label above the logos" }] },
  { title: "Built for growth", fields: [
    { key: "growth_label", label: "Small label" },
    { key: "growth_title", label: "Heading" },
    { key: "growth_body", label: "Text", long: true },
  ] },
  { title: "Upcoming live workshops (only shown when a live session is scheduled)", fields: [
    { key: "live_label", label: "Small label" },
    { key: "live_title", label: "Heading" },
    { key: "live_sub", label: "Text", long: true },
  ] },
  { title: "Programmes", fields: [
    { key: "paths_label", label: "Small label" },
    { key: "paths_title", label: "Heading" },
    { key: "paths_button", label: "Button" },
  ] },
  { title: "Featured courses", fields: [
    { key: "catalog_label", label: "Small label" },
    { key: "catalog_title", label: "Heading" },
    { key: "catalog_sub", label: "Text", long: true },
    { key: "catalog_button", label: "Button" },
  ] },
  { title: "Faculty", fields: [
    { key: "faculty_label", label: "Small label" },
    { key: "faculty_title", label: "Heading" },
    { key: "faculty_sub", label: "Text", long: true },
    { key: "faculty_button", label: "Button" },
  ] },
  { title: "For organisations", fields: [
    { key: "org_label", label: "Small label" },
    { key: "org_title", label: "Heading" },
    { key: "org_sub", label: "Text", long: true },
    { key: "org_box_title", label: "White box heading" },
    { key: "org_box_body", label: "White box text", long: true },
    { key: "org_box_button", label: "White box button" },
  ] },
];

const MAX = 1000;
const txt = (v: unknown, max = MAX) => (typeof v === "string" ? v.replace(/\r/g, "").trim().slice(0, max) : "");

/** Saved values over the defaults: blank text uses the original wording; empty lists use the original lists. */
export function mergeHome(saved: Partial<Record<string, unknown>> | null | undefined): HomeContent {
  const out = { ...HOME_DEFAULTS } as HomeContent;
  if (!saved) return out;
  for (const s of HOME_SECTIONS) for (const f of s.fields) {
    const v = txt(saved[f.key]);
    if (v) out[f.key] = v;
  }
  const tabs = cleanTabs(saved.org_tabs);
  if (tabs.length) out.org_tabs = tabs;
  const faq = cleanFaq(saved.faq);
  if (faq.length) out.faq = faq;
  return out;
}

export function cleanTabs(v: unknown): OrgTab[] {
  if (!Array.isArray(v)) return [];
  return v.slice(0, 6).map((t) => ({
    label: txt(t?.label, 60), title: txt(t?.title, 300),
    bullets: (Array.isArray(t?.bullets) ? t.bullets : []).map((b: unknown) => txt(b, 120)).filter(Boolean).slice(0, 8),
  })).filter((t) => t.label);
}

export function cleanFaq(v: unknown): FaqItem[] {
  if (!Array.isArray(v)) return [];
  return v.slice(0, 30).map((f) => ({ q: txt(f?.q, 300), a: txt(f?.a, 3000) })).filter((f) => f.q && f.a);
}

/** Only what differs from the defaults is stored, so later wording changes to the defaults still show through. */
export function diffHome(input: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const s of HOME_SECTIONS) for (const f of s.fields) {
    const v = txt(input[f.key]);
    if (v && v !== HOME_DEFAULTS[f.key]) out[f.key] = v;
  }
  const tabs = cleanTabs(input.org_tabs);
  if (tabs.length && JSON.stringify(tabs) !== JSON.stringify(HOME_DEFAULTS.org_tabs)) out.org_tabs = tabs;
  const faq = cleanFaq(input.faq);
  if (faq.length && JSON.stringify(faq) !== JSON.stringify(HOME_DEFAULTS.faq)) out.faq = faq;
  return out;
}
