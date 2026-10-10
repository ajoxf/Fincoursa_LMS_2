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

