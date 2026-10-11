"use server";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadCatalog, importEnrollments, importOrders, importUsers, type ChunkResult, type Row } from "@/lib/thinkific/import";
import type { Kind } from "@/lib/thinkific/columns";
import { sendMigrationInvite } from "@/lib/email/events";

export type ProductMatch = { name: string; rows: number; match: string | null };

/** Which Thinkific product names match a course/bundle here (for the mapping step). */
export async function analyseProducts(names: { name: string; rows: number }[], mapping: Record<string, string>): Promise<{ products: ProductMatch[]; options: { value: string; label: string }[] }> {
  await requireRole(["admin"]);
  const cat = await loadCatalog(createAdminClient());
  const options = [
    ...cat.courses.map((c) => ({ value: `course:${c.slug}`, label: `Course: ${c.title}` })),
    ...cat.bundles.map((b) => ({ value: `bundle:${b.slug}`, label: `Bundle: ${b.title}` })),
  ];
  const valueById = new Map<string, string>([
    ...cat.courses.map((c): [string, string] => [c.id, `course:${c.slug}`]),
    ...cat.bundles.map((b): [string, string] => [b.id, `bundle:${b.slug}`]),
  ]);
  const products = names.map(({ name, rows }) => {
    const t = cat.resolve(name, mapping);
    return { name, rows, match: t === "skip" ? "skip" : t ? valueById.get(t.id) ?? null : null };
  });
  return { products, options };
}

export async function runImportChunk(kind: Kind, rows: Row[], cols: Record<string, string | null>, mapping: Record<string, string>, currency: string, offset: number): Promise<ChunkResult> {
  await requireRole(["admin"]);
  if (rows.length > 200) throw new Error("chunk too large");
  if (kind === "users") return importUsers(rows, cols, offset);
  if (kind === "enrollments") return importEnrollments(rows, cols, mapping, offset);
  return importOrders(rows, cols, mapping, currency, offset);
}

/** Migrated students who haven't had the "we've moved" email yet. */
export async function pendingInvites(): Promise<number> {
  await requireRole(["admin"]);
  return (await pendingInviteIds(100000)).length;
}

async function pendingInviteIds(limit: number) {
  const db = createAdminClient();
  const ids = new Set<string>();
  for (let from = 0; ; from += 1000) {
    const { data } = await db.from("enrollments").select("user_id").eq("source", "migration").range(from, from + 999);
    (data ?? []).forEach((r) => ids.add(r.user_id));
    if (!data || data.length < 1000) break;
  }
  const all = [...ids];
  const sent = new Set<string>();
  for (let i = 0; i < all.length; i += 500) {
    const { data } = await db.from("email_log").select("ref").eq("template", "migration_invite").in("ref", all.slice(i, i + 500));
    (data ?? []).forEach((r) => sent.add(r.ref));
  }
  return all.filter((id) => !sent.has(id)).slice(0, limit);
}

export async function sendInviteBatch(size = 25): Promise<{ sent: number; remaining: number }> {
  await requireRole(["admin"]);
  const ids = await pendingInviteIds(size);
  let sent = 0;
  for (const id of ids) if (await sendMigrationInvite(id)) sent++;
  return { sent, remaining: Math.max(0, (await pendingInviteIds(100000)).length) };
}


export type ImageCopyResult = { copied: number; failed: { url: string; reason: string }[]; remaining: number };

/**
 * Copies images still hosted on Thinkific's CDN (instructor photos and logos, course and bundle images)
 * into our own public storage and points the records at the copies. Safe to run repeatedly.
 */
export async function copyThinkificImages(): Promise<ImageCopyResult> {
  await requireRole(["admin"]);
  const db = createAdminClient();
  const isTk = (u: string | null) => Boolean(u && /^https:\/\/([a-z0-9-]+\.)*thinkific\.com\//i.test(u));
  const [{ data: ins }, { data: courses }, { data: bundles }] = await Promise.all([
    db.from("instructors").select("id, photo_url, org_logo_url"),
    db.from("courses").select("id, thumbnail_url"),
    db.from("bundles").select("id, thumbnail_url"),
  ]);
  type Job = { table: "instructors" | "courses" | "bundles"; id: string; col: string; url: string };
  const jobs: Job[] = [
    ...(ins ?? []).flatMap((r) => [
      ...(isTk(r.photo_url) ? [{ table: "instructors" as const, id: r.id, col: "photo_url", url: r.photo_url! }] : []),
      ...(isTk(r.org_logo_url) ? [{ table: "instructors" as const, id: r.id, col: "org_logo_url", url: r.org_logo_url! }] : []),
    ]),
    ...(courses ?? []).filter((r) => isTk(r.thumbnail_url)).map((r) => ({ table: "courses" as const, id: r.id, col: "thumbnail_url", url: r.thumbnail_url! })),
    ...(bundles ?? []).filter((r) => isTk(r.thumbnail_url)).map((r) => ({ table: "bundles" as const, id: r.id, col: "thumbnail_url", url: r.thumbnail_url! })),
  ];
  const done = new Map<string, string>(); // same image used twice -> one copy
  const failed: ImageCopyResult["failed"] = [];
  let copied = 0;
  for (const j of jobs.slice(0, 40)) {
    try {
      let publicUrl = done.get(j.url);
      if (!publicUrl) {
        const res = await fetch(j.url, { headers: { Referer: "https://fincoursa.com/", "User-Agent": "Mozilla/5.0 (FinCoursa image migration)" } });
        const type = (res.headers.get("content-type") ?? "").split(";")[0];
        if (!res.ok || !type.startsWith("image/")) throw new Error(`Thinkific returned ${res.status}${type ? ` (${type})` : ""}`);
        const name = (j.url.split("/").pop() ?? "image").toLowerCase().replace(/[^a-z0-9._-]+/g, "-").slice(-80);
        const path = `migrated/${name}`;
        const { error } = await db.storage.from("course-images").upload(path, await res.arrayBuffer(), { contentType: type, upsert: true });
        if (error) throw new Error(error.message);
        publicUrl = db.storage.from("course-images").getPublicUrl(path).data.publicUrl;
        done.set(j.url, publicUrl);
      }
      await db.from(j.table).update({ [j.col]: publicUrl }).eq("id", j.id);
      copied++;
    } catch (e) {
      failed.push({ url: j.url, reason: e instanceof Error ? e.message : String(e) });
    }
  }
  return { copied, failed, remaining: Math.max(0, jobs.length - 40) };
}
