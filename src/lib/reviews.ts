import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCashbackSettings, type CashbackSettings } from "@/lib/cashback";

/** A paid order whose cashback can still be topped up to the review rate once the buyer sends feedback and a review. */
export type ReviewOffer = {
  orderId: string; orderNumber: number; courseId: string; courseSlug: string; courseTitle: string;
  currency: string; topUpMinor: number; pct: number; paidAt: string | null;
};

/** The review top-up is on, and credit can still be used (when there's a fixed "use credit by" date). */
export function reviewBonusLive(s: CashbackSettings) {
  if (!s.review_bonus_pct) return false;
  return !s.redeem_by || Date.now() <= new Date(`${s.redeem_by}T23:59:59+04:00`).getTime();
}

/** Paid, unrefunded orders that earned cashback, have a course, and have no review yet. */
export async function reviewOffers(userId: string, s?: CashbackSettings): Promise<ReviewOffer[]> {
  const cb = s ?? await getCashbackSettings();
  if (!reviewBonusLive(cb)) return [];
  const db = createAdminClient();
  const { data: orders } = await db.from("orders")
    .select("id, number, currency, total_minor, tax_minor, cashback_minor, refunded_minor, paid_at, order_items(course_id, course:courses(slug, title))")
    .eq("user_id", userId).eq("status", "paid").gt("cashback_minor", 0);
  if (!orders?.length) return [];
  const { data: done } = await db.from("course_reviews").select("order_id").in("order_id", orders.map((o) => o.id));
  const reviewed = new Set((done ?? []).map((r) => r.order_id));
  const out: ReviewOffer[] = [];
  for (const o of orders) {
    if (reviewed.has(o.id) || Number(o.refunded_minor ?? 0) > 0) continue;
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    const item = (o.order_items ?? []).find((i: any) => i.course_id && i.course) as any;
    if (!item) continue;
    const target = Math.round((Number(o.total_minor) - Number(o.tax_minor ?? 0)) * cb.review_bonus_pct! / 100);
    const top = target - Number(o.cashback_minor ?? 0);
    if (top <= 0) continue;
    out.push({ orderId: o.id, orderNumber: o.number, courseId: item.course_id, courseSlug: item.course.slug, courseTitle: item.course.title,
      currency: o.currency, topUpMinor: top, pct: cb.review_bonus_pct!, paidAt: o.paid_at });
  }
  return out;
}

export type PublicReview = { id: string; name: string; rating: number; review: string; date: string };

/** Approved reviews the buyer agreed to publish, newest first, shown with their first name. */
export async function publishedReviews(courseId: string, limit = 6): Promise<PublicReview[]> {
  const db = createAdminClient();
  const { data } = await db.from("course_reviews")
    .select("id, rating, review, created_at, profile:profiles!course_reviews_user_id_fkey(full_name)")
    .eq("course_id", courseId).eq("status", "approved").eq("can_publish", true)
    .order("created_at", { ascending: false }).limit(limit);
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  return (data ?? []).map((r: any) => ({
    id: r.id, rating: r.rating, review: r.review, date: r.created_at,
    name: (r.profile?.full_name ?? "").trim().split(/\s+/)[0] || "A candidate",
  }));
}
