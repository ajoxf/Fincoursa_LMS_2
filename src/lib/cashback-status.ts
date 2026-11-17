import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Where cashback credit stands: used (spent at a later checkout), open (still spendable), expired (unused when it
 * lapsed: costs FinCoursa nothing) or cancelled (the order was refunded). From credit_grants: used = amount - remaining.
 * Cashback here = purchase cashback (source 'cashback') plus feedback-and-review top-ups (manual grants noted
 * "Feedback and review cashback, order #N").
 */
export type CashbackSplit = { given: number; used: number; open: number; expired: number; cancelled: number };
export const emptySplit = (): CashbackSplit => ({ given: 0, used: 0, open: 0, expired: 0, cancelled: 0 });

type Grant = { amount_minor: number; remaining_minor: number; expires_at: string | null; revoked_at: string | null };

export function splitGrant(g: Grant, now = Date.now()): CashbackSplit {
  const amount = Number(g.amount_minor), left = Number(g.remaining_minor);
  const s = emptySplit();
  s.given = amount;
  if (g.revoked_at) { s.cancelled = left; s.used = Math.max(0, amount - left); return s; }
  s.used = Math.max(0, amount - left);
  if (g.expires_at && new Date(g.expires_at).getTime() <= now) s.expired = left; else s.open = left;
  return s;
}

export function addSplit(a: CashbackSplit, b: CashbackSplit, k = 1): CashbackSplit {
  return { given: a.given + b.given * k, used: a.used + b.used * k, open: a.open + b.open * k, expired: a.expired + b.expired * k, cancelled: a.cancelled + b.cancelled * k };
}

const REVIEW_NOTE = /^Feedback and review cashback, order #(\d+)$/;

/** Cashback split per order (purchase cashback plus any review top-up for that order). */
export async function cashbackByOrder(db: SupabaseClient, orderIds: string[]): Promise<Map<string, CashbackSplit>> {
  const out = new Map<string, CashbackSplit>();
  const ids = [...new Set(orderIds)].filter(Boolean);
  if (!ids.length) return out;
  const [{ data: grants }, { data: orders }] = await Promise.all([
    db.from("credit_grants").select("order_id, amount_minor, remaining_minor, expires_at, revoked_at").eq("source", "cashback").in("order_id", ids),
    db.from("orders").select("id, number, user_id").in("id", ids),
  ]);
  for (const g of grants ?? []) out.set(g.order_id, addSplit(out.get(g.order_id) ?? emptySplit(), splitGrant(g)));
  const byNumber = new Map((orders ?? []).map((o) => [`${o.user_id}:${o.number}`, o.id as string]));
  const users = [...new Set((orders ?? []).map((o) => o.user_id))];
  if (users.length) {
    const { data: reviews } = await db.from("credit_grants").select("user_id, note, amount_minor, remaining_minor, expires_at, revoked_at")
      .eq("source", "manual").in("user_id", users).like("note", "Feedback and review cashback, order #%");
    for (const g of reviews ?? []) {
      const m = REVIEW_NOTE.exec(g.note ?? "");
      const id = m ? byNumber.get(`${g.user_id}:${m[1]}`) : undefined;
      if (id) out.set(id, addSplit(out.get(id) ?? emptySplit(), splitGrant(g)));
    }
  }
  return out;
}

/** Every cashback credit (purchase + review top-ups), for the admin overview. */
export async function allCashbackGrants(db: SupabaseClient) {
  const { data } = await db.from("credit_grants")
    .select("id, user_id, currency, source, note, order_id, amount_minor, remaining_minor, expires_at, revoked_at, created_at, profile:profiles!credit_grants_user_id_fkey(email, full_name)")
    .or('source.eq.cashback,note.like."Feedback and review cashback, order #*"')
    .order("created_at", { ascending: false }).limit(20000);
  return (data ?? []) as unknown as (Grant & { id: string; user_id: string; currency: string; source: string; note: string | null; created_at: string; profile: { email: string | null; full_name: string | null } | null })[];
}

/**
 * Each sale's share of its order's cashback split (a programme order is shared across its courses in the same
 * proportion as the cashback given). Keyed by the instructor_earnings row id.
 */
export async function cashbackForEarnings(db: SupabaseClient, rows: { id: string; order_id: string; cashback_given_minor: number; cashback_minor: number }[]) {
  const byOrder = await cashbackByOrder(db, rows.map((r) => r.order_id));
  const out = new Map<string, CashbackSplit>();
  for (const r of rows) {
    const o = byOrder.get(r.order_id);
    const mine = Number(r.cashback_given_minor || r.cashback_minor);
    if (!o || !o.given || !mine) { out.set(r.id, { ...emptySplit(), given: mine, open: mine }); continue; }
    const k = mine / o.given;
    const s = addSplit(emptySplit(), o, k);
    out.set(r.id, { given: mine, used: Math.round(s.used), open: Math.round(s.open), expired: Math.round(s.expired), cancelled: Math.round(s.cancelled) });
  }
  return out;
}
