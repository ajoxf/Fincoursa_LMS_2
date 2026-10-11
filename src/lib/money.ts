const ZERO_DECIMAL = new Set(["JPY", "KRW"]);
const THREE_DECIMAL = new Set(["BHD", "KWD", "OMR", "JOD"]);

export function minorUnitsFactor(currency: string) {
  const c = currency.toUpperCase();
  if (ZERO_DECIMAL.has(c)) return 1;
  if (THREE_DECIMAL.has(c)) return 1000;
  return 100;
}

export function formatMoney(minor: number | bigint | string | null | undefined, currency = (process.env.NEXT_PUBLIC_DEFAULT_CURRENCY ?? "USD").toUpperCase()) {
  const value = Number(minor ?? 0) / minorUnitsFactor(currency);
  return new Intl.NumberFormat("en-AE", { style: "currency", currency, maximumFractionDigits: 2 }).format(value);
}

/** Split a tax-inclusive or tax-exclusive amount into net/tax/total, all in minor units. */
export function computeTax(amountMinor: number, rate: number, pricesIncludeTax: boolean) {
  if (!rate) return { net: amountMinor, tax: 0, total: amountMinor };
  if (pricesIncludeTax) {
    const net = Math.round(amountMinor / (1 + rate));
    return { net, tax: amountMinor - net, total: amountMinor };
  }
  const tax = Math.round(amountMinor * rate);
  return { net: amountMinor, tax, total: amountMinor + tax };
}
