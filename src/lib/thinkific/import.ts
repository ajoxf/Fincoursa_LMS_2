import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseAmountMinor, parseDate, parsePct, titleKey } from "./columns";

/**
 * Thinkific → FinCoursa import. Every step is idempotent: re-running a file updates rows instead of
 * duplicating them, and progress only ever moves forward. Historical orders are recorded for reporting
 * but never create instructor earnings or partner commissions.
 */

export type Row = Record<string, string>;
export type ChunkResult = { created: number; updated: number; skipped: number; errors: { row: number; message: string }[] };
const result = (): ChunkResult => ({ created: 0, updated: 0, skipped: 0, errors: [] });
const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

type Db = ReturnType<typeof createAdminClient>;

/** Products in the catalogue, matched by title (case/punctuation-insensitive) or explicit mapping. */
export async function loadCatalog(db: Db) {
  const [{ data: courses }, { data: bundles }] = await Promise.all([
    db.from("courses").select("id, title, slug"),
    db.from("bundles").select("id, title, slug, bundle_courses(course_id)"),
  ]);
  const byTitle = new Map<string, { kind: "course" | "bundle"; id: string; courseIds: string[] }>();
  for (const c of courses ?? []) byTitle.set(titleKey(c.title), { kind: "course", id: c.id, courseIds: [c.id] });
  for (const b of bundles ?? []) byTitle.set(titleKey(b.title), { kind: "bundle", id: b.id, courseIds: (b.bundle_courses ?? []).map((x) => x.course_id) });
  const bySlug = new Map<string, { kind: "course" | "bundle"; id: string; courseIds: string[] }>();
  for (const c of courses ?? []) bySlug.set(`course:${c.slug}`, { kind: "course", id: c.id, courseIds: [c.id] });
  for (const b of bundles ?? []) bySlug.set(`bundle:${b.slug}`, { kind: "bundle", id: b.id, courseIds: (b.bundle_courses ?? []).map((x) => x.course_id) });
  return {
    courses: courses ?? [], bundles: bundles ?? [],
    /** mapping: Thinkific product name → "course:slug" | "bundle:slug" | "skip" */
    resolve(name: string, mapping: Record<string, string>) {
      const m = mapping[name];
      if (m === "skip") return "skip" as const;
      if (m && bySlug.has(m)) return bySlug.get(m)!;
      return byTitle.get(titleKey(name)) ?? null;
    },
  };
}

async function findOrCreateUser(db: Db, email: string, name: string | null, joined: string | null) {
  const e = email.trim().toLowerCase();
  const { data: existing } = await db.from("profiles").select("id").eq("email", e).maybeSingle();
  if (existing) return { id: existing.id, created: false };
  const { data, error } = await db.auth.admin.createUser({
    email: e, email_confirm: true, user_metadata: { full_name: name ?? "", migrated_from: "thinkific" },
  });
  if (error || !data.user) throw new Error(error?.message ?? "could not create user");
  if (joined) await db.from("profiles").update({ created_at: joined }).eq("id", data.user.id);
  return { id: data.user.id, created: true };
}

export async function importUsers(rows: Row[], cols: Record<string, string | null>, offset: number): Promise<ChunkResult> {
  const db = createAdminClient();
  const r = result();
  for (const [i, row] of rows.entries()) {
    try {
      const email = (row[cols.email!] ?? "").trim();
      if (!isEmail(email)) { r.errors.push({ row: offset + i + 2, message: `invalid email "${email}"` }); continue; }
      const name = (cols.full && row[cols.full]) || [cols.first && row[cols.first], cols.last && row[cols.last]].filter(Boolean).join(" ") || null;
      const u = await findOrCreateUser(db, email, name, parseDate(cols.joined ? row[cols.joined] : null));
      if (u.created) r.created++; else r.skipped++;
    } catch (e) {
      r.errors.push({ row: offset + i + 2, message: e instanceof Error ? e.message : String(e) });
    }
  }
  return r;
}

/** Thinkific gives course-level %; we complete the first N required lessons in order so the student resumes in the right place. */
export async function importEnrollments(rows: Row[], cols: Record<string, string | null>, mapping: Record<string, string>, offset: number): Promise<ChunkResult> {
  const db = createAdminClient();
  const cat = await loadCatalog(db);
  const lessonCache = new Map<string, { id: string }[]>();
  const lessonsOf = async (courseId: string) => {
    if (!lessonCache.has(courseId)) {
      const { data } = await db.from("lessons").select("id, position, is_required, chapter:chapters(position)").eq("course_id", courseId);
      /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
      const sorted = (data ?? []).filter((l) => l.is_required).sort((a: any, b: any) => (a.chapter?.position ?? 0) - (b.chapter?.position ?? 0) || a.position - b.position);
      lessonCache.set(courseId, sorted);
    }
    return lessonCache.get(courseId)!;
  };
  const r = result();

  for (const [i, row] of rows.entries()) {
    const line = offset + i + 2;
    try {
      const email = (row[cols.email!] ?? "").trim();
      if (!isEmail(email)) { r.errors.push({ row: line, message: `invalid email "${email}"` }); continue; }
      const product = (row[cols.course!] ?? "").trim();
      const target = cat.resolve(product, mapping);
      if (target === "skip") { r.skipped++; continue; }
      if (!target) { r.errors.push({ row: line, message: `no course matches "${product}"` }); continue; }

      const user = await findOrCreateUser(db, email, cols.name ? row[cols.name] : null, null);
      const started = parseDate(cols.started ? row[cols.started] : null) ?? new Date().toISOString();
      const completedAt = parseDate(cols.completed ? row[cols.completed] : null);
      const expires = parseDate(cols.expires ? row[cols.expires] : null);
      const pct = completedAt ? 100 : parsePct(cols.pct ? row[cols.pct] : null);

      for (const courseId of target.courseIds) {
        const { data: existing } = await db.from("enrollments").select("id, progress_pct").eq("user_id", user.id).eq("course_id", courseId).maybeSingle();
        await db.from("enrollments").upsert({
          user_id: user.id, course_id: courseId, source: "migration", enrolled_at: started, expires_at: expires, revoked_at: null,
          bundle_id: target.kind === "bundle" ? target.id : null,
        }, { onConflict: "user_id,course_id" });
        if (existing) r.updated++; else r.created++;

        // progress only moves forward
        if (existing && Number(existing.progress_pct) >= pct) continue;
        const lessons = await lessonsOf(courseId);
        const n = pct >= 100 ? lessons.length : Math.floor((pct / 100) * lessons.length);
        if (n > 0) {
          const when = completedAt ?? started;
          await db.from("lesson_progress").upsert(
            lessons.slice(0, n).map((l) => ({ user_id: user.id, lesson_id: l.id, course_id: courseId, completed_at: when, updated_at: when })),
            { onConflict: "user_id,lesson_id", ignoreDuplicates: true },
          );
        }
        await db.rpc("recompute_enrollment", { p_user: user.id, p_course: courseId });
        // keep historical dates rather than "now"
        await db.from("enrollments").update({
          last_activity_at: completedAt ?? started,
          ...(pct >= 100 ? { completed_at: completedAt ?? started } : {}),
          last_lesson_id: n > 0 ? lessons[Math.min(n, lessons.length) - 1].id : null,
        }).eq("user_id", user.id).eq("course_id", courseId);
        if (pct >= 100) await db.from("certificates").update({ issued_at: completedAt ?? started }).eq("user_id", user.id).eq("course_id", courseId);
      }
    } catch (e) {
      r.errors.push({ row: line, message: e instanceof Error ? e.message : String(e) });
    }
  }
  return r;
}

/** Historical orders: kept for revenue history and the student's purchase list. No earnings/commissions are created. */
export async function importOrders(rows: Row[], cols: Record<string, string | null>, mapping: Record<string, string>, defaultCurrency: string, offset: number): Promise<ChunkResult> {
  const db = createAdminClient();
  const cat = await loadCatalog(db);
  const { data: affs } = await db.from("affiliates").select("id, code");
  const affByCode = new Map((affs ?? []).map((a) => [String(a.code).toLowerCase(), a.id]));
  const r = result();

  for (const [i, row] of rows.entries()) {
    const line = offset + i + 2;
    try {
      const legacyId = (row[cols.id!] ?? "").trim();
      const email = (row[cols.email!] ?? "").trim();
      if (!legacyId) { r.errors.push({ row: line, message: "missing order id" }); continue; }
      if (!isEmail(email)) { r.errors.push({ row: line, message: `invalid email "${email}"` }); continue; }
      const status = (cols.status ? row[cols.status] : "").toLowerCase();
      if (status && /(fail|cancel|void|pending)/.test(status)) { r.skipped++; continue; }

      const ref = `thinkific:${legacyId}`;
      const { data: dup } = await db.from("orders").select("id").eq("gateway", "thinkific").eq("gateway_session_id", ref).maybeSingle();
      if (dup) { r.skipped++; continue; }

      const product = (row[cols.product!] ?? "").trim();
      const target = cat.resolve(product, mapping);
      if (target === "skip") { r.skipped++; continue; }
      if (!target) { r.errors.push({ row: line, message: `no course or bundle matches "${product}"` }); continue; }

      const user = await findOrCreateUser(db, email, cols.name ? row[cols.name] : null, null);
      const amount = parseAmountMinor(cols.amount ? row[cols.amount] : null, cols.amountCents ? row[cols.amountCents] : null);
      const currency = ((cols.currency && row[cols.currency]) || defaultCurrency).toUpperCase().slice(0, 3);
      const when = parseDate(cols.date ? row[cols.date] : null) ?? new Date().toISOString();
      const isRefund = /refund/.test(status);
      const affCode = cols.affiliate ? (row[cols.affiliate] ?? "").trim().toLowerCase() : "";

      const { data: order, error } = await db.from("orders").insert({
        user_id: user.id, status: isRefund ? "refunded" : "paid", currency,
        subtotal_minor: amount, total_minor: amount, refunded_minor: isRefund ? amount : 0, tax_minor: 0,
        gateway: "thinkific", gateway_session_id: ref, paid_at: when, created_at: when,
        affiliate_id: affCode ? affByCode.get(affCode) ?? null : null, attribution: affCode && affByCode.get(affCode) ? "link" : null,
        metadata: { legacy: true, source: "thinkific", product, coupon: cols.coupon ? row[cols.coupon] || null : null, affiliate_code: affCode || null },
      }).select("id").single();
      if (error || !order) throw new Error(error?.message ?? "could not create order");
      await db.from("order_items").insert({
        order_id: order.id, title: product, unit_amount_minor: amount, quantity: 1,
        course_id: target.kind === "course" ? target.id : null, bundle_id: target.kind === "bundle" ? target.id : null,
      });
      // make sure the buyer has access (enrolment export may not include every purchase)
      if (!isRefund) {
        for (const courseId of target.courseIds) {
          await db.from("enrollments").upsert(
            { user_id: user.id, course_id: courseId, source: "migration", order_id: order.id, enrolled_at: when, bundle_id: target.kind === "bundle" ? target.id : null },
            { onConflict: "user_id,course_id", ignoreDuplicates: true },
          );
        }
      }
      r.created++;
    } catch (e) {
      r.errors.push({ row: line, message: e instanceof Error ? e.message : String(e) });
    }
  }
  return r;
}
