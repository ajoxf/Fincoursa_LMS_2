import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { pickPrice } from "@/lib/catalog";
import { computeTax } from "@/lib/money";
import { env, partnerCodesEnabled } from "@/lib/env";
import { currencyForCountry } from "@/lib/currency";
import { benefitLive, foundingDiscount, getFoundingSettings, getMembership } from "@/lib/founding";
import { cashbackAmount, cashbackLabel, cashbackRule, creditBalance, getCashbackSettings, type ItemCashback } from "@/lib/cashback";

export type QuoteInput = {
  courseSlug?: string;
  bundleSlug?: string;
  couponCode?: string;
  country: string | null;
  currency?: string;
  /** Business buyer's VAT/GST number; triggers reverse charge where the country allows it */
  businessTaxId?: string;
  /** signed-in buyer: lets the quote use their store credit */
  userId?: string;
  /** pay part of the price with store credit (default true when the buyer has some) */
  useCredit?: boolean;
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
  taxLabel: string;
  pricesIncludeTax: boolean;
  reverseCharge: boolean;
  coupon: { id: string; code: string } | null;
  couponError: string | null;
  /** founding-member discount (members only), and why it isn't applied */
  foundingMinor: number;
  foundingNote: string | null;
  /** store credit the buyer has in this currency, how much this order uses, and why it can't be used */
  creditAvailableMinor: number;
  creditMinor: number;
  creditNote: string | null;
  /** cashback this order earns once paid */
  cashbackMinor: number;
  /** "10%" or "$10.00", for the summary; null when no cashback */
  cashbackLabel: string | null;
  cashbackValidDays: number | null;
};

/** Server-side price calculation. Never trust amounts sent from the browser. */
export async function buildQuote(input: QuoteInput): Promise<Quote | null> {
  const db = createAdminClient();
  // The buyer's country picks the currency when the item has a price in it; otherwise the default currency.
  const currency = (input.currency ?? currencyForCountry(input.country) ?? env.defaultCurrency).toUpperCase();
  const priceCols = "id, type, currency, amount_minor, compare_at_minor, interval, installments, is_active, created_at";

  let item: Quote["item"] | null = null;
  let price: ReturnType<typeof pickPrice> = null;
  let itemCashback: ItemCashback | null = null;

  if (input.courseSlug) {
    const { data } = await db.from("courses").select(`id, slug, title, status, coming_soon, cashback_mode, cashback_percent, cashback_fixed, prices(${priceCols})`).eq("slug", input.courseSlug).maybeSingle();
    // "Coming soon" courses are visible but can't be bought yet
    if (!data || data.status !== "published" || data.coming_soon) return null;
    price = pickPrice(data.prices, currency);
    itemCashback = { mode: data.cashback_mode, percent: data.cashback_percent, fixed: data.cashback_fixed };
    if (price) item = { kind: "course", id: data.id, slug: data.slug, title: data.title, priceId: price.id, courseIds: [data.id] };
  } else if (input.bundleSlug) {
    const { data } = await db.from("bundles").select(`id, slug, title, status, cashback_mode, cashback_percent, cashback_fixed, prices(${priceCols}), bundle_courses(course_id)`).eq("slug", input.bundleSlug).maybeSingle();
    if (!data || data.status !== "published") return null;
    price = pickPrice(data.prices, currency);
    itemCashback = { mode: data.cashback_mode, percent: data.cashback_percent, fixed: data.cashback_fixed };
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

  // Founding members get their discount on every purchase. Without "combine with codes", the larger of
  // the member discount and the code applies.
  let founding = 0;
  let foundingNote: string | null = null;
  const fs = await getFoundingSettings();
  if (input.userId && benefitLive(fs) && (await getMembership(input.userId))) {
    if (coupon && !fs.allow_with_coupon) {
      const alone = foundingDiscount(fs, price.currency, subtotal);
      if (alone > discount) {
        foundingNote = `Your founding member discount is larger than code ${coupon.code}, so it was used instead.`;
        coupon = null; discount = 0; founding = alone;
      } else foundingNote = "Your code is larger than your founding member discount, so the code was used instead.";
    } else founding = foundingDiscount(fs, price.currency, subtotal - discount);
  }

  // Only countries switched on in Admin → Taxes are charged.
  const { data: tax } = input.country
    ? await db.from("tax_rates").select("name, label, rate, prices_include_tax, reverse_charge").eq("country_code", input.country).eq("is_active", true).maybeSingle()
    : { data: null };
  const rate = Number(tax?.rate ?? 0);
  const includes = tax?.prices_include_tax ?? true;

  // Store credit pays part of the price after any code, before tax (like a discount).
  const cb = await getCashbackSettings();
  const afterCode = subtotal - discount - founding;
  const creditAvailable = input.userId ? await creditBalance(input.userId, price.currency) : 0;
  let credit = 0;
  let creditNote: string | null = null;
  if (creditAvailable > 0) {
    if (coupon && !cb.allow_with_coupon) creditNote = "Credit can't be combined with a discount code.";
    else if (input.useCredit !== false) credit = Math.min(creditAvailable, Math.floor(afterCode * Math.max(0, Math.min(100, cb.max_redeem_pct)) / 100));
  }
  const base = afterCode - credit;
  const t = computeTax(base, rate, includes);
  // Reverse charge: a business buyer with a tax ID pays the price before tax and accounts for the tax itself.
  const reverseCharge = Boolean(tax?.reverse_charge && rate > 0 && input.businessTaxId?.trim());
  const totalMinor = reverseCharge ? (includes ? base - t.tax : base) : t.total;

  // Cashback is earned on what is paid, before tax (and optionally on the credit part too).
  const rule = cashbackRule(cb, itemCashback);
  const earnBase = computeTax(cb.earn_on_credit ? afterCode : base, rate, includes).net;
  const cashbackMinor = cashbackAmount(rule, price.currency, earnBase);

  return {
    item, currency: price.currency, subtotalMinor: subtotal, discountMinor: discount,
    taxMinor: reverseCharge ? 0 : t.tax, totalMinor, taxRate: reverseCharge ? 0 : rate,
    taxName: tax?.name ?? null, taxLabel: tax?.label ?? "Tax", pricesIncludeTax: includes, reverseCharge,
    coupon, couponError, foundingMinor: founding, foundingNote,
    creditAvailableMinor: creditAvailable, creditMinor: credit, creditNote,
    cashbackMinor, cashbackLabel: cashbackMinor > 0 ? cashbackLabel(rule, price.currency) : null, cashbackValidDays: cb.validity_days ?? null,
  };
}

export type Attribution = { affiliateId: string; attribution: "link" | "coupon"; campaign: string | null } | null;

/**
 * A sale is credited to at most ONE partner, through ONE route:
 *  1. their referral link (last click within the cookie window), otherwise
 *  2. their partner code used at checkout (only while partner codes are enabled).
 * If a buyer arrives on one partner's link and types another partner's code, the link wins;
 * the code still gives the buyer its discount. Self-referrals and unapproved partners never earn.
 */
export async function resolveAttribution(opts: { refCode?: string; campaign?: string; buyerId: string; couponId?: string | null }): Promise<Attribution> {
  const db = createAdminClient();
  const ok = (a: { id: string; user_id: string; status: string } | null) => a && a.status === "approved" && a.user_id !== opts.buyerId;

  if (opts.refCode) {
    const { data } = await db.from("affiliates").select("id, user_id, status").eq("code", opts.refCode).maybeSingle();
    if (ok(data)) {
      await db.rpc("record_referral_signup", { p_user: opts.buyerId, p_code: opts.refCode });
      return { affiliateId: data!.id, attribution: "link", campaign: opts.campaign ?? null };
    }
  }
  if (partnerCodesEnabled && opts.couponId) {
    const { data: c } = await db.from("coupons").select("affiliate:affiliates(id, user_id, status)").eq("id", opts.couponId).maybeSingle();
    const a = (c?.affiliate ?? null) as { id: string; user_id: string; status: string } | null;
    if (ok(a)) return { affiliateId: a!.id, attribution: "coupon", campaign: null };
  }
  return null;
}
