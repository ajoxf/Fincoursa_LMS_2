import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { pickPrice } from "@/lib/catalog";
import { computeTax } from "@/lib/money";
import { env } from "@/lib/env";

export type QuoteInput = {
  courseSlug?: string;
  bundleSlug?: string;
  couponCode?: string;
  country: string | null;
  currency?: string;
};

export type Quote = {
  item: { kind: "course" | "bundle"; id: string; slug: string; title: string; priceId: string; courseIds: string[] };
  currency: string;
  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  totalMinor: number;
  taxRate: number;
  taxName: string | null;
  pricesIncludeTax: boolean;
  coupon: { id: string; code: string } | null;
  couponError: string | null;
};

/** Server-side price calculation. Never trust amounts sent from the browser. */
export async function buildQuote(input: QuoteInput): Promise<Quote | null> {
  const db = createAdminClient();
  const currency = (input.currency ?? env.defaultCurrency).toUpperCase();
  const priceCols = "id, type, currency, amount_minor, compare_at_minor, interval, installments, is_active";

  let item: Quote["item"] | null = null;
  let price: ReturnType<typeof pickPrice> = null;

  if (input.courseSlug) {
    const { data } = await db.from("courses").select(`id, slug, title, status, prices(${priceCols})`).eq("slug", input.courseSlug).maybeSingle();
    if (!data || data.status !== "published") return null;
    price = pickPrice(data.prices, currency);
    if (price) item = { kind: "course", id: data.id, slug: data.slug, title: data.title, priceId: price.id, courseIds: [data.id] };
  } else if (input.bundleSlug) {
    const { data } = await db.from("bundles").select(`id, slug, title, status, prices(${priceCols}), bundle_courses(course_id)`).eq("slug", input.bundleSlug).maybeSingle();
    if (!data || data.status !== "published") return null;
    price = pickPrice(data.prices, currency);
    if (price) item = { kind: "bundle", id: data.id, slug: data.slug, title: data.title, priceId: price.id,
      courseIds: (data.bundle_courses ?? []).map((b) => b.course_id) };
  }
  if (!item || !price) return null;

  const subtotal = price.amount_minor;
  let discount = 0;
  let coupon: Quote["coupon"] = null;
  let couponError: string | null = null;

  if (input.couponCode?.trim()) {
    const { data: c } = await db.from("coupons").select("*").eq("code", input.couponCode.trim()).maybeSingle();
    const now = new Date();
    if (!c || !c.is_active) couponError = "This code isn't valid.";
    else if (c.starts_at && new Date(c.starts_at) > now) couponError = "This code isn't active yet.";
    else if (c.ends_at && new Date(c.ends_at) < now) couponError = "This code has expired.";
    else if (c.max_redemptions != null && c.redeemed_count >= c.max_redemptions) couponError = "This code has been fully used.";
    else if ((c.course_id && c.course_id !== (item.kind === "course" ? item.id : null)) ||
             (c.bundle_id && c.bundle_id !== (item.kind === "bundle" ? item.id : null))) couponError = "This code doesn't apply to this item.";
    else if (c.amount_off_minor && c.currency && c.currency !== price.currency) couponError = "This code doesn't apply in this currency.";
    else {
      discount = c.percent_off ? Math.round(subtotal * Number(c.percent_off) / 100) : Number(c.amount_off_minor ?? 0);
      discount = Math.min(discount, subtotal);
      coupon = { id: c.id, code: c.code };
    }
  }

  const { data: tax } = input.country
    ? await db.from("tax_rates").select("name, rate, prices_include_tax").eq("country_code", input.country).maybeSingle()
    : { data: null };
  const rate = Number(tax?.rate ?? 0);
  const includes = tax?.prices_include_tax ?? true;
  const t = computeTax(subtotal - discount, rate, includes);

  return {
    item, currency: price.currency, subtotalMinor: subtotal, discountMinor: discount,
    taxMinor: t.tax, totalMinor: t.total, taxRate: rate, taxName: tax?.name ?? null, pricesIncludeTax: includes,
    coupon, couponError,
  };
}

/** Resolve the affiliate from the referral cookie, ignoring self-referrals and unapproved codes. */
export async function resolveAffiliate(code: string | undefined, buyerId: string) {
  if (!code) return null;
  const { data } = await createAdminClient().from("affiliates").select("id, user_id, status").eq("code", code).maybeSingle();
  if (!data || data.status !== "approved" || data.user_id === buyerId) return null;
  return data.id as string;
}
