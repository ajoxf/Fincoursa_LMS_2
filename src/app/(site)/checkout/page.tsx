import type { Metadata } from "next";
import { headers, cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { buildQuote } from "@/lib/checkout";
import { gatewaysFor } from "@/lib/payments/registry";
import { formatMoney } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { startCheckout } from "./actions";

export const metadata: Metadata = { title: "Checkout", robots: { index: false } };

const COUNTRIES: [string, string][] = [
  ["AE", "United Arab Emirates"], ["SA", "Saudi Arabia"], ["QA", "Qatar"], ["KW", "Kuwait"], ["BH", "Bahrain"], ["OM", "Oman"],
  ["EG", "Egypt"], ["IN", "India"], ["PK", "Pakistan"], ["GB", "United Kingdom"], ["US", "United States"], ["SG", "Singapore"],
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

  const quote = await buildQuote({ courseSlug, bundleSlug, couponCode: one("coupon"), country });
  if (!quote) notFound();

  // Already own everything in this item? Go straight to learning.
  const { data: owned } = await (await createClient())
    .from("enrollments").select("course_id").eq("user_id", user.id).is("revoked_at", null).in("course_id", quote.item.courseIds);
  if (quote.item.courseIds.length && (owned?.length ?? 0) >= quote.item.courseIds.length) {
    redirect(quote.item.kind === "course" ? `/learn/${quote.item.slug}` : "/dashboard");
  }

  const gateways = quote.totalMinor > 0 ? await gatewaysFor(country, quote.currency) : [];
  const ref = (await cookies()).get("fc_ref")?.value;
  const m = (n: number) => formatMoney(n, quote.currency);

  return (
    <section className="fc-container grid gap-10 py-16 lg:grid-cols-[1fr_380px]">
      <div>
        <h1 className="text-3xl font-bold text-primary">Checkout</h1>

        <form className="fc-card mt-8 grid gap-4 p-6" method="get">
          {courseSlug && <input type="hidden" name="course" value={courseSlug} />}
          {bundleSlug && <input type="hidden" name="bundle" value={bundleSlug} />}
          <label className="grid gap-1 text-sm font-medium">Billing country
            <select name="country" defaultValue={country} className="fc-input">
              {COUNTRIES.map(([c, n]) => <option key={c} value={c}>{n}</option>)}
              {!COUNTRIES.some(([c]) => c === country) && <option value={country}>{country}</option>}
            </select>
          </label>
          <label className="grid gap-1 text-sm font-medium">Coupon code
            <div className="flex gap-2"><input name="coupon" defaultValue={one("coupon")} className="fc-input" /><button className="fc-btn fc-btn-outline">Apply</button></div>
          </label>
          {quote.couponError && <p className="text-sm text-danger">{quote.couponError}</p>}
          {quote.coupon && <p className="text-sm text-success">Code {quote.coupon.code} applied.</p>}
        </form>

        <form action={startCheckout} className="mt-8 grid gap-4">
          <input type="hidden" name="course" value={courseSlug ?? ""} />
          <input type="hidden" name="bundle" value={bundleSlug ?? ""} />
          <input type="hidden" name="coupon" value={quote.coupon?.code ?? ""} />
          <input type="hidden" name="country" value={country} />
          {quote.totalMinor === 0 ? (
            <button className="fc-btn fc-btn-primary">Complete enrollment</button>
          ) : gateways.length === 0 ? (
            <p className="fc-card p-5 text-sm text-danger">Online payment isn&apos;t available for this country yet. Please contact us to enroll.</p>
          ) : (
            <>
              <fieldset className="grid gap-2">
                <legend className="mb-2 text-sm font-medium">Payment method</legend>
                {gateways.map((g, i) => (
                  <label key={g.id} className="fc-card flex items-center gap-3 p-4">
                    <input type="radio" name="gateway" value={g.id} defaultChecked={i === 0} />{g.label}
                  </label>
                ))}
              </fieldset>
              <button className="fc-btn fc-btn-primary">Pay {m(quote.totalMinor)}</button>
            </>
          )}
          {ref && <p className="text-xs text-muted">Referred by partner code {ref}.</p>}
        </form>
      </div>

      <aside className="fc-card self-start p-6">
        <h2 className="font-semibold text-primary">Order summary</h2>
        <p className="mt-4 font-medium">{quote.item.title}</p>
        <dl className="mt-4 grid gap-2 text-sm">
          <div className="flex justify-between"><dt>Price</dt><dd>{m(quote.subtotalMinor)}</dd></div>
          {quote.discountMinor > 0 && <div className="flex justify-between text-success"><dt>Discount</dt><dd>−{m(quote.discountMinor)}</dd></div>}
          {quote.taxMinor > 0 && (
            <div className="flex justify-between text-muted">
              <dt>{quote.taxName ?? "Tax"} ({(quote.taxRate * 100).toFixed(0)}%){quote.pricesIncludeTax ? " included" : ""}</dt><dd>{m(quote.taxMinor)}</dd>
            </div>
          )}
          <div className="mt-2 flex justify-between border-t border-line pt-3 text-base font-bold"><dt>Total</dt><dd>{m(quote.totalMinor)}</dd></div>
        </dl>
      </aside>
    </section>
  );
}
