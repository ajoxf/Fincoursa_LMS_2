import type { Metadata } from "next";
import { headers, cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { buildQuote } from "@/lib/checkout";
import { gatewaysFor } from "@/lib/payments/registry";
import { formatMoney } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { ALL_COUNTRIES, countryName, nowIso } from "@/lib/format";
import { PayButton } from "./PayButton";
import { startCheckout } from "./actions";
import { getCourse } from "@/lib/catalog";

export const metadata: Metadata = { title: "Checkout", robots: { index: false } };

// Most common first, then every country A–Z
const TOP = ["AE", "SA", "IN", "GB", "US", "QA", "KW", "BH", "OM", "EG", "PK", "SG"];
const COUNTRIES: [string, string][] = [
  ...TOP.map((c) => [c, countryName(c)] as [string, string]),
  ...ALL_COUNTRIES.filter(([c]) => !TOP.includes(c)),
];

export default async function CheckoutPage({ searchParams }: PageProps<"/checkout">) {
  const sp = await searchParams;
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const courseSlug = one("course");
  const bundleSlug = one("bundle");
  const qs = new URLSearchParams(Object.entries(sp).filter(([, v]) => typeof v === "string") as [string, string][]).toString();
  const user = await requireUser(`/checkout?${qs}`);

  const h = await headers();
  const { data: profile } = await (await createClient()).from("profiles").select("country_code").eq("id", user.id).maybeSingle();
  const country = (one("country") ?? profile?.country_code ?? h.get("x-vercel-ip-country") ?? "AE").toUpperCase();

  const company = one("company") ?? "";
  const taxId = one("tax_id") ?? "";
  const quote = await buildQuote({ courseSlug, bundleSlug, couponCode: one("coupon"), country, businessTaxId: taxId || undefined });
  // what the buyer gets: live sessions, a fixed access period, or lifetime access
  const detail = courseSlug ? await getCourse(courseSlug) : null;
  const accessText = detail?.liveSessions.length ? `${detail.liveSessions.length} live sessions + recordings`
    : detail?.access_days ? `${detail.access_days} days access` : "Lifetime access";
  if (!quote) notFound();

  // Already own everything in this item? Go straight to learning.
  const { data: owned } = await (await createClient())
    .from("enrollments").select("course_id, expires_at").eq("user_id", user.id).is("revoked_at", null).in("course_id", quote.item.courseIds);
  // expired access can be bought again (renewal)
  const activeOwned = (owned ?? []).filter((e) => !e.expires_at || e.expires_at > nowIso());
  if (quote.item.courseIds.length && activeOwned.length >= quote.item.courseIds.length) {
    redirect(quote.item.kind === "course" ? `/learn/${quote.item.slug}` : "/dashboard");
  }

  const gateways = quote.totalMinor > 0 ? await gatewaysFor(country, quote.currency) : [];
  const ref = (await cookies()).get("fc_ref")?.value;
  const m = (n: number) => formatMoney(n, quote.currency);

  const field = "w-full rounded-lg bg-surface px-4 py-3.5 text-[15px] text-ink focus:outline-2 focus:outline-accent";
  return (
    <section className="bg-surface">
      <div className="fc-container grid gap-8 py-16 lg:grid-cols-[1fr_400px] lg:py-24">
        <div className="grid content-start gap-6">
          <div>
            <span className="fc-pill">Checkout</span>
            <h1 className="fc-h2 mt-4 text-ink">Complete your enrollment</h1>
          </div>

          <form className="grid gap-4 rounded-2xl bg-white p-6 md:p-8" method="get">
            <p className="text-sm font-medium uppercase tracking-[0.14em] text-ink">1 · Billing details</p>
            {courseSlug && <input type="hidden" name="course" value={courseSlug} />}
            {bundleSlug && <input type="hidden" name="bundle" value={bundleSlug} />}
            <label className="grid gap-1.5 text-sm text-ink/80">Billing country
              <select name="country" defaultValue={country} className={field}>
                {COUNTRIES.map(([c, n]) => <option key={c} value={c}>{n}</option>)}
                {!COUNTRIES.some(([c]) => c === country) && <option value={country}>{country}</option>}
              </select>
            </label>
            <label className="grid gap-1.5 text-sm text-ink/80">Coupon code
              <span className="flex gap-2"><input name="coupon" defaultValue={one("coupon")} placeholder="Enter code" className={field} /><button className="fc-btn fc-btn-outline !min-w-0 text-ink">Apply</button></span>
            </label>
            <details className="rounded-lg border border-line p-4" open={Boolean(company || taxId)}>
              <summary className="cursor-pointer text-sm text-ink">Buying for a business? Add company and tax details</summary>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1.5 text-sm text-ink/80">Company name<input name="company" defaultValue={company} className={field} /></label>
                <label className="grid gap-1.5 text-sm text-ink/80">VAT / GST number<input name="tax_id" defaultValue={taxId} className={field} /></label>
              </div>
              <p className="mt-2 text-xs text-muted">Shown on your tax invoice. In countries with reverse charge (EU, UK and others), registered businesses pay the price without VAT.</p>
            </details>
            <button className="justify-self-start text-sm text-ink underline underline-offset-4">Update total</button>
            {quote.couponError && <p className="text-sm text-danger">{quote.couponError}</p>}
            {quote.coupon && <p className="text-sm text-success">Code {quote.coupon.code} applied.</p>}
          </form>

          <form action={startCheckout} className="grid gap-4 rounded-2xl bg-white p-6 md:p-8">
            <p className="text-sm font-medium uppercase tracking-[0.14em] text-ink">2 · Payment</p>
            <input type="hidden" name="course" value={courseSlug ?? ""} />
            <input type="hidden" name="bundle" value={bundleSlug ?? ""} />
            <input type="hidden" name="coupon" value={quote.coupon?.code ?? ""} />
            <input type="hidden" name="country" value={country} />
            <input type="hidden" name="company" value={company} />
            <input type="hidden" name="tax_id" value={taxId} />
            {quote.totalMinor === 0 ? (
              <PayButton>Complete enrollment</PayButton>
            ) : gateways.length === 0 ? (
              <p className="rounded-lg bg-danger/10 p-4 text-sm text-danger">Online payment isn&apos;t available for this country yet. Please contact us to enroll.</p>
            ) : (
              <>
                <fieldset className="grid gap-2">
                  <legend className="sr-only">Payment method</legend>
                  {gateways.map((g, i) => (
                    <label key={g.id} className="flex cursor-pointer items-center gap-3 rounded-lg border border-line p-4 text-[15px] text-ink has-[:checked]:border-ink">
                      <input type="radio" name="gateway" value={g.id} defaultChecked={i === 0} className="accent-black" />{g.label}
                    </label>
                  ))}
                </fieldset>
                <PayButton>Pay {m(quote.totalMinor)}</PayButton>
                <p className="text-xs text-muted">Card details are entered on the payment provider&apos;s secure page. We never see or store them.</p>
              </>
            )}
            {ref && <p className="text-xs text-muted">Referred by partner {ref}.</p>}
          </form>
        </div>

        <aside className="self-start rounded-2xl bg-white p-6 md:p-8">
          <p className="text-sm font-medium uppercase tracking-[0.14em] text-ink">Order summary</p>
          <p className="mt-4 text-2xl font-normal leading-snug tracking-tight text-ink">{quote.item.title}</p>
          <p className="mt-1 text-sm text-muted">{quote.item.kind === "bundle" ? `Bundle · ${quote.item.courseIds.length} courses` : "Course"} · {accessText}</p>
          <dl className="mt-6 grid gap-3 text-[15px] text-ink">
            <div className="flex justify-between"><dt>Price</dt><dd>{m(quote.subtotalMinor)}</dd></div>
            {quote.discountMinor > 0 && <div className="flex justify-between text-success"><dt>Discount ({quote.coupon?.code})</dt><dd>−{m(quote.discountMinor)}</dd></div>}
            {quote.taxMinor > 0 && (
              <div className="flex justify-between text-muted">
                <dt>{quote.taxName ?? quote.taxLabel} ({+(quote.taxRate * 100).toFixed(1)}%){quote.pricesIncludeTax ? " included" : " added"}</dt><dd>{m(quote.taxMinor)}</dd>
              </div>
            )}
            {quote.reverseCharge && (
              <div className="flex justify-between text-muted"><dt>{quote.taxLabel} reverse charge</dt><dd>{m(0)}</dd></div>
            )}
            <div className="mt-2 flex items-baseline justify-between border-t border-ink pt-4"><dt className="font-medium">Total</dt><dd className="text-3xl font-bold tracking-tight">{m(quote.totalMinor)}</dd></div>
          </dl>
          <p className="mt-4 text-xs text-muted">A receipt and tax invoice are emailed after payment.</p>
        </aside>
      </div>
    </section>
  );
}
