"use server";
import { revalidatePath } from "next/cache";
import { env } from "@/lib/env";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { minorUnitsFactor } from "@/lib/money";

export type FormState = { ok?: boolean; error?: string } | null;

const slugify = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
const refresh = (id: string) => { revalidatePath(`/admin/courses/${id}`); revalidatePath("/admin/courses"); revalidatePath(`/instructor/courses/${id}`); };

async function audit(actor: string, action: string, entityId: string, data?: object) {
  await createAdminClient().from("audit_log").insert({ actor_id: actor, action, entity: "course", entity_id: entityId, data });
}

export async function createCourseDraft(form: FormData) {
  const admin = await requireRole(["admin"]);
  const title = String(form.get("title") ?? "").trim();
  if (!title) throw new Error("Title required");
  const db = createAdminClient();
  let slug = slugify(String(form.get("slug") ?? "") || title);
  const { data: clash } = await db.from("courses").select("id").eq("slug", slug).maybeSingle();
  if (clash) slug = `${slug}-${Date.now().toString(36)}`;
  const { data: c, error } = await db.from("courses").insert({ title, slug, status: "draft" }).select("id").single();
  if (error || !c) throw new Error(error?.message ?? "Could not create course");
  await db.from("chapters").insert({ course_id: c.id, title: "Introduction", position: 1 });
  await db.from("prices").insert({ course_id: c.id, type: "one_time", currency: env.defaultCurrency, amount_minor: 0 });
  await audit(admin.id, "course.created", c.id);
  redirect(`/admin/courses/${c.id}`);
}

const details = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  slug: z.string().trim().min(1).max(80),
  subtitle: z.string().trim().max(300).optional(),
  description: z.string().trim().max(10000).optional(),
  category_id: z.string().uuid().or(z.literal("")).optional(),
  new_category: z.string().trim().max(80).optional(),
  level: z.string().trim().max(40).optional(),
  thumbnail_url: z.string().trim().max(1000).optional(),
  access_days: z.string().optional(),
  seo_title: z.string().trim().max(200).optional(),
  seo_description: z.string().trim().max(400).optional(),
  highlights: z.string().max(3000).optional(),
});

export async function saveCourseDetails(courseId: string, _: FormState, form: FormData): Promise<FormState> {
  const admin = await requireRole(["admin"]);
  const parsed = details.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  const db = createAdminClient();

  let categoryId = d.category_id || null;
  if (d.new_category) {
    const { data: cat } = await db.from("categories")
      .upsert({ name: d.new_category, slug: slugify(d.new_category) }, { onConflict: "slug" }).select("id").single();
    categoryId = cat?.id ?? categoryId;
  }
  const slug = slugify(d.slug);
  const { data: clash } = await db.from("courses").select("id").eq("slug", slug).neq("id", courseId).maybeSingle();
  if (clash) return { error: "Another course already uses this URL." };

  const days = Number(d.access_days);
  const { error } = await db.from("courses").update({
    title: d.title, slug, subtitle: d.subtitle || null, description: d.description || null,
    category_id: categoryId, level: d.level || null, thumbnail_url: d.thumbnail_url || null,
    access_days: days > 0 ? Math.round(days) : null,
    is_featured: form.get("is_featured") === "on", certificate_enabled: form.get("certificate_enabled") === "on",
    seo_title: d.seo_title || null, seo_description: d.seo_description || null,
    highlights: (d.highlights ?? "").split("\n").map((x) => x.trim()).filter(Boolean).slice(0, 12),
  }).eq("id", courseId);
  if (error) return { error: error.message };
  await audit(admin.id, "course.updated", courseId);
  refresh(courseId);
  return { ok: true };
}

export async function setCourseStatus(courseId: string, status: "draft" | "published" | "archived") {
  const admin = await requireRole(["admin"]);
  const db = createAdminClient();
  if (status === "published") {
    const { count } = await db.from("lessons").select("id", { count: "exact", head: true }).eq("course_id", courseId);
    if (!count) throw new Error("Add at least one lesson before publishing.");
  }
  await db.from("courses").update({ status, ...(status === "published" ? { published_at: new Date().toISOString() } : {}) }).eq("id", courseId);
  await audit(admin.id, `course.${status}`, courseId);
  refresh(courseId);
}

export async function savePrice(courseId: string, priceId: string | null, form: FormData) {
  await requireRole(["admin"]);
  const currency = String(form.get("currency") ?? env.defaultCurrency).toUpperCase().slice(0, 3);
  const type = String(form.get("type") ?? "one_time");
  const f = minorUnitsFactor(currency);
  const amount = Math.round(Number(form.get("amount") || 0) * f);
  const compare = Number(form.get("compare_at") || 0);
  const row = {
    course_id: courseId, currency, type: amount === 0 ? "free" : type, amount_minor: Math.max(0, amount),
    compare_at_minor: compare > 0 ? Math.round(compare * f) : null,
    installments: type === "payment_plan" ? Math.max(2, Number(form.get("installments") || 3)) : null,
    interval: type === "subscription" ? (String(form.get("interval")) === "year" ? "year" : "month") : null,
    is_active: true,
  };
  const db = createAdminClient();
  const { error } = priceId ? await db.from("prices").update(row).eq("id", priceId) : await db.from("prices").insert(row);
  if (error) throw new Error(error.message);
  refresh(courseId);
}

export async function archivePrice(courseId: string, priceId: string) {
  await requireRole(["admin"]);
  await createAdminClient().from("prices").update({ is_active: false }).eq("id", priceId);
  refresh(courseId);
}

export async function addCourseInstructor(courseId: string, form: FormData) {
  await requireRole(["admin"]);
  const instructorId = String(form.get("instructor_id") ?? "");
  if (!instructorId) return;
  const share = String(form.get("share") ?? "");
  const db = createAdminClient();
  const { count } = await db.from("course_instructors").select("course_id", { count: "exact", head: true }).eq("course_id", courseId);
  await db.from("course_instructors").upsert({
    course_id: courseId, instructor_id: instructorId, is_primary: !count,
    revenue_share_pct: share === "" ? null : Math.min(100, Math.max(0, Number(share))),
  });
  refresh(courseId);
}

export async function removeCourseInstructor(courseId: string, instructorId: string) {
  await requireRole(["admin"]);
  await createAdminClient().from("course_instructors").delete().eq("course_id", courseId).eq("instructor_id", instructorId);
  refresh(courseId);
}

/** Only drafts nobody has bought can be deleted; otherwise archive. */
export async function deleteCourse(courseId: string) {
  const admin = await requireRole(["admin"]);
  const db = createAdminClient();
  const [{ data: c }, { count: sold }] = await Promise.all([
    db.from("courses").select("status").eq("id", courseId).single(),
    db.from("order_items").select("id", { count: "exact", head: true }).eq("course_id", courseId),
  ]);
  if (c?.status !== "draft" || (sold ?? 0) > 0) throw new Error("Only unsold drafts can be deleted — archive it instead.");
  await db.from("courses").delete().eq("id", courseId);
  await audit(admin.id, "course.deleted", courseId);
  revalidatePath("/admin/courses");
  redirect("/admin/courses");
}
