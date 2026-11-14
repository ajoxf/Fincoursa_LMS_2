"use client";
import { useActionState, useState } from "react";
import { formatMoney, minorUnitsFactor } from "@/lib/money";
import { countriesForCurrency, countryName, PRICE_CURRENCIES } from "@/lib/currency";
import { archivePrice, savePrice, type PriceState } from "../actions";

export type PriceRow = { id: string; type: string; currency: string; amount_minor: number; compare_at_minor: number | null; installments: number | null; interval: string | null };
export type TaxRow = { country_code: string; name: string; rate: number; prices_include_tax: boolean };

const TYPES = [
  { id: "one_time", label: "One-time payment" },
  { id: "payment_plan", label: "Payment plan" },
  { id: "subscription", label: "Subscription" },
];

/** Who sees a price in this currency, and which tax applies to them. */
function audience(currency: string, all: string[], defaultCurrency: string, taxes: TaxRow[]) {
  const own = countriesForCurrency(currency);
  const ownTaxes = (codes: string[]) => taxes.filter((t) => codes.includes(t.country_code));
  if (currency === defaultCurrency) {
    // default currency: everyone whose own currency has no price here
    const covered = all.filter((c) => c !== defaultCurrency).flatMap(countriesForCurrency);
    const elsewhere = taxes.filter((t) => !covered.includes(t.country_code));
    return { who: all.length > 1 ? "Buyers in all other countries see this price." : "All buyers see this price.", taxes: elsewhere };
  }
  const names = [...new Set(own.map(countryName))];
  return { who: names.length ? `Buyers in ${names.join(", ")} see this price.` : `No country is set to use ${currency}; only buyers who choose it would see it.`, taxes: ownTaxes(own) };
}

function taxLine(t: TaxRow, amountMinor: number, currency: string) {
  const pct = `${Math.round(t.rate * 10000) / 100}%`;
  if (t.prices_include_tax) {
    const tax = amountMinor - Math.round(amountMinor / (1 + t.rate));
    return `${t.name} ${pct} is included (${formatMoney(tax, currency)} of the price) for buyers in ${countryName(t.country_code)}.`;
  }
  return `${t.name} ${pct} is added at checkout for buyers in ${countryName(t.country_code)}.`;
}

function PriceForm({ courseId, p, allCurrencies, defaultCurrency, taxes, duplicate, onDone }: {
  courseId: string; p: PriceRow | null; allCurrencies: string[]; defaultCurrency: string; taxes: TaxRow[]; duplicate?: boolean; onDone?: () => void;
}) {
  const [state, action, pending] = useActionState<PriceState, FormData>(async (prev, form) => {
    const r = await savePrice(courseId, p?.id ?? null, prev, form);
    if (r?.ok && onDone) onDone();
    return r;
  }, null);
  const [type, setType] = useState(p?.type === "free" || !p ? "one_time" : p.type);
  const [currency, setCurrency] = useState(p?.currency ?? [defaultCurrency, ...PRICE_CURRENCIES].find((c) => !allCurrencies.includes(c)) ?? defaultCurrency);
  const f = minorUnitsFactor(currency);
  const [amount, setAmount] = useState(p ? String(p.amount_minor / minorUnitsFactor(p.currency)) : "");
  const [compare, setCompare] = useState(p?.compare_at_minor ? String(p.compare_at_minor / minorUnitsFactor(p.currency)) : "");
  const amountMinor = Math.round(Number(amount || 0) * f);
  const compareMinor = Math.round(Number(compare || 0) * f);
  const options = [...new Set([...PRICE_CURRENCIES, ...allCurrencies, currency])];
  const others = allCurrencies.filter((c) => c !== p?.currency);
  const clash = others.includes(currency);
  const a = audience(currency, [...new Set([...others, currency])], defaultCurrency, taxes);
  const kind = type === "payment_plan" ? ` in ${p?.installments ?? 3} instalments` : type === "subscription" ? ` per ${p?.interval ?? "month"}` : " one-time";

  return (
    <form action={action} className="grid items-end gap-2 rounded-md border border-line p-3 sm:grid-cols-[1fr_110px_130px_130px_auto]">
      <label className="grid gap-1 text-xs font-medium">Type
        <select name="type" value={type} onChange={(e) => setType(e.target.value)} className="fc-input !py-2">
          {TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
      </label>
      <label className="grid gap-1 text-xs font-medium">Currency
        <select name="currency" value={currency} onChange={(e) => setCurrency(e.target.value)} className="fc-input !py-2">
          {options.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </label>
      <label className="grid gap-1 text-xs font-medium">Price
        <input name="amount" type="number" min={0} step="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)} className="fc-input !py-2" />
      </label>
      <label className="grid gap-1 text-xs font-medium">Was (optional)
        <input name="compare_at" type="number" min={0} step="0.01" value={compare} onChange={(e) => setCompare(e.target.value)} className="fc-input !py-2" />
      </label>
      <input type="hidden" name="installments" value={p?.installments ?? 3} />
      <input type="hidden" name="interval" value={p?.interval ?? "month"} />
      <div className="flex items-center gap-3">
        <button disabled={pending || clash} className="fc-btn fc-btn-dark !px-4 !py-2 text-sm">{pending ? "Saving…" : p ? "Save" : "Add price"}</button>
        {p && <button type="button" onClick={() => { if (confirm(`Remove the ${p.currency} price?`)) archivePrice(courseId, p.id); }} className="text-xs text-danger underline">Remove</button>}
      </div>
      <div className="grid gap-0.5 text-xs sm:col-span-5">
        {clash ? (
          <p className="text-danger">There&apos;s already a {currency} price for this course. Each currency can have one price: edit that one instead.</p>
        ) : amount.trim() === "" ? (
          <p className="text-muted">Enter a price. {a.who}</p>
        ) : amountMinor === 0 ? (
          <p className="text-muted">Free: students enrol without checkout. {a.who}</p>
        ) : (
          <>
            <p className="text-ink">
              <span className="font-semibold">{formatMoney(amountMinor, currency)}</span>{kind}
              {compareMinor > amountMinor && <span className="text-muted"> (was <span className="line-through">{formatMoney(compareMinor, currency)}</span>)</span>}
              <span className="text-muted"> · {a.who}</span>
            </p>
            {a.taxes.map((t) => <p key={t.country_code} className="text-muted">{taxLine(t, amountMinor, currency)}</p>)}
            {a.taxes.length === 0 && <p className="text-muted">No tax is charged for these buyers (see Admin → Taxes).</p>}
          </>
        )}
        {duplicate && <p className="text-danger">This duplicates another {p?.currency} price. Remove one, or buyers may see either.</p>}
        {state?.ok && <p className="text-success">Saved.</p>}
        {state?.error && <p className="text-danger">{state.error}</p>}
      </div>
    </form>
  );
}

export function PricingEditor({ courseId, prices, taxes, defaultCurrency }: { courseId: string; prices: PriceRow[]; taxes: TaxRow[]; defaultCurrency: string }) {
  const [addKey, setAddKey] = useState(0);
  const [adding, setAdding] = useState(false);
  // stable order: default currency first, then alphabetical
  const rows = [...prices].sort((a, b) => Number(b.currency === defaultCurrency) - Number(a.currency === defaultCurrency) || a.currency.localeCompare(b.currency));
  const currencies = rows.map((r) => r.currency);
  const seen = new Set<string>();
  return (
    <div className="grid gap-3">
      {rows.map((p) => {
        const dup = seen.has(p.currency);
        seen.add(p.currency);
        return <PriceForm key={`${p.id}:${p.currency}:${p.amount_minor}:${p.compare_at_minor}:${p.type}`} courseId={courseId} p={p} allCurrencies={currencies} defaultCurrency={defaultCurrency} taxes={taxes} duplicate={dup} />;
      })}
      {adding ? (
        <div className="rounded-md border border-dashed border-line p-3">
          <p className="mb-2 text-sm font-medium">Add a price in another currency</p>
          <PriceForm key={addKey} courseId={courseId} p={null} allCurrencies={currencies} defaultCurrency={defaultCurrency} taxes={taxes}
            onDone={() => { setAdding(false); setAddKey((k) => k + 1); }} />
        </div>
      ) : (
        <button type="button" onClick={() => setAdding(true)} className="justify-self-start text-sm font-medium underline">+ Add a price in another currency</button>
      )}
      <p className="text-xs text-muted">
        Buyers see the price in their country&apos;s currency when the course has one (for example INR for India); everyone else sees the {defaultCurrency} price.
        Set the amount to 0 to make the course free. Payment plans and subscriptions need a gateway that supports them.
      </p>
    </div>
  );
}
