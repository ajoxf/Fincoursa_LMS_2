"use server";
import { revalidatePath } from "next/cache";
import { env } from "@/lib/env";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { minorUnitsFactor } from "@/lib/money";

export type FormState = { ok?: boolean; error?: string } | null;
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
const refresh = (id: string) => { revalidatePath(`/admin/bundles/${id}`); revalidatePath("/admin/bundles"); };

export async function createBundle(form: FormData) {
  await requireRole(["admin"]);
  const title = String(form.get("title") ?? "").trim();
  if (!title) throw new Error("Title required");
  const db = createAdminClient();
  let slug = slugify(title);
  if ((await db.from("bundles").select("id").eq("slug", slug).maybeSingle()).data) slug = `${slug}-${Date.now().toString(36)}`;
  const { data: b, error } = await db.from("bundles").insert({ title, slug, status: "draft" }).select("id").single();
  if (error || !b) throw new Error(error?.message ?? "Could not create programme");
  await db.from("prices").insert({ bundle_id: b.id, type: "free", currency: env.defaultCurrency, amount_minor: 0 });
  redirect(`/admin/bundles/${b.id}`);
}

export async function saveBundle(bundleId: string, _: FormState, form: FormData): Promise<FormState> {
  await requireRole(["admin"]);
  const title = String(form.get("title") ?? "").trim();
  const slug = slugify(String(form.get("slug") ?? "") || title);
  if (!title || !slug) return { error: "Title is required" };
  const db = createAdminClient();
  if ((await db.from("bundles").select("id").eq("slug", slug).neq("id", bundleId).maybeSingle()).data) return { error: "Another bundle uses this URL." };
  const { error } = await db.from("bundles").update({
    title, slug, description: String(form.get("description") ?? "").trim() || null,
    thumbnail_url: String(form.get("thumbnail_url") ?? "") || null,
    status: ["draft", "published", "archived"].includes(String(form.get("status"))) ? String(form.get("status")) : "draft",
    is_featured: form.get("is_featured") === "on",
  }).eq("id", bundleId);
  if (error) return { error: error.message };

  const currency = String(form.get("currency") ?? env.defaultCurrency).toUpperCase().slice(0, 3);
  const amount = Math.max(0, Math.round(Number(form.get("amount") || 0) * minorUnitsFactor(currency)));
  const row = { bundle_id: bundleId, type: amount ? "one_time" : "free", currency, amount_minor: amount, is_active: true };
  const { data: current } = await db.from("prices").select("id").eq("bundle_id", bundleId).eq("is_active", true).limit(1).maybeSingle();
  if (current) await db.from("prices").update(row).eq("id", current.id);
  else await db.from("prices").insert(row);
  refresh(bundleId);
  return { ok: true };
}

export async function addBundleCourse(bundleId: string, form: FormData) {
  await requireRole(["admin"]);
  const courseId = String(form.get("course_id") ?? "");
  if (!courseId) return;
  const db = createAdminClient();
  const { data: last } = await db.from("bundle_courses").select("position").eq("bundle_id", bundleId).order("position", { ascending: false }).limit(1).maybeSingle();
  await db.from("bundle_courses").upsert({ bundle_id: bundleId, course_id: courseId, position: (last?.position ?? 0) + 1 });
  refresh(bundleId);
}

export async function removeBundleCourse(bundleId: string, courseId: string) {
  await requireRole(["admin"]);
  await createAdminClient().from("bundle_courses").delete().eq("bundle_id", bundleId).eq("course_id", courseId);
  refresh(bundleId);
}

export async function moveBundleCourse(bundleId: string, courseId: string, dir: -1 | 1) {
  await requireRole(["admin"]);
  const db = createAdminClient();
  const { data } = await db.from("bundle_courses").select("course_id, position").eq("bundle_id", bundleId).order("position");
  const list = (data ?? []).map((r, k) => ({ ...r, position: k + 1 }));
  const i = list.findIndex((r) => r.course_id === courseId), j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return;
  [list[i].position, list[j].position] = [list[j].position, list[i].position];
  for (const r of list) await db.from("bundle_courses").update({ position: r.position }).eq("bundle_id", bundleId).eq("course_id", r.course_id);
  refresh(bundleId);
}
