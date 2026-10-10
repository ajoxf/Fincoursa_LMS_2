"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export type FormState = { ok?: boolean; error?: string } | null;
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);

export async function createInstructor(form: FormData) {
  await requireRole(["admin"]);
  const name = String(form.get("name") ?? "").trim();
  if (!name) throw new Error("Name required");
  const db = createAdminClient();
  let slug = slugify(name);
  if ((await db.from("instructors").select("id").eq("slug", slug).maybeSingle()).data) slug = `${slug}-${Date.now().toString(36)}`;
  const { data: last } = await db.from("instructors").select("sort_order").order("sort_order", { ascending: false }).limit(1).maybeSingle();
  const { data, error } = await db.from("instructors").insert({ name, slug, sort_order: (last?.sort_order ?? 0) + 1, is_published: false }).select("id").single();
  if (error || !data) throw new Error(error?.message ?? "Could not create instructor");
  redirect(`/admin/instructors/${data.id}`);
}

export async function saveInstructor(id: string, _: FormState, form: FormData): Promise<FormState> {
  await requireRole(["admin"]);
  const name = String(form.get("name") ?? "").trim();
  if (!name) return { error: "Name is required" };
  const share = Number(form.get("default_revenue_share_pct") || 0);
  const db = createAdminClient();

  // Optional: link a login so the instructor sees their own dashboard
  const email = String(form.get("login_email") ?? "").trim().toLowerCase();
  let userId: string | null | undefined = undefined;
  if (email) {
    const { data: profile } = await db.from("profiles").select("id").eq("email", email).maybeSingle();
    if (!profile) return { error: `No account found for ${email}. Ask them to sign up first, then link it here.` };
    const { data: taken } = await db.from("instructors").select("id").eq("user_id", profile.id).neq("id", id).maybeSingle();
    if (taken) return { error: "That account is already linked to another instructor profile." };
    userId = profile.id;
    await db.from("user_roles").upsert({ user_id: profile.id, role: "instructor" });
  } else if (form.get("unlink") === "on") {
    userId = null;
  }

  const { error } = await db.from("instructors").update({
    name, title: String(form.get("title") ?? "").trim() || null, bio: String(form.get("bio") ?? "").trim() || null,
    photo_url: String(form.get("photo_url") ?? "") || null, org_logo_url: String(form.get("org_logo_url") ?? "") || null,
    default_revenue_share_pct: Math.min(100, Math.max(0, share)), is_published: form.get("is_published") === "on",
    ...(userId !== undefined ? { user_id: userId } : {}),
  }).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(`/admin/instructors/${id}`);
  revalidatePath("/admin/instructors");
  return { ok: true };
}
