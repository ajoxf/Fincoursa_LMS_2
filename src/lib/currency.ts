// Which currency a buyer sees: their country's currency when the course/programme has a price in it,
// otherwise the site's default currency. Safe in the browser.

const EUROZONE = ["AT", "BE", "CY", "DE", "EE", "ES", "FI", "FR", "GR", "HR", "IE", "IT", "LT", "LU", "LV", "MT", "NL", "PT", "SI", "SK"];

export const COUNTRY_CURRENCY: Record<string, string> = {
  IN: "INR", AE: "AED", US: "USD", GB: "GBP", SG: "SGD", AU: "AUD", CA: "CAD", SA: "SAR", NZ: "NZD", CH: "CHF",
  ...Object.fromEntries(EUROZONE.map((c) => [c, "EUR"])),
};

/** Currencies offered in the admin price editor (others can still exist in the data). */
export const PRICE_CURRENCIES = ["INR", "USD", "AED", "EUR", "GBP", "SGD", "AUD", "CAD", "SAR"];

const COUNTRY_NAMES: Record<string, string> = {
  IN: "India", AE: "the UAE", US: "the US", GB: "the UK", SG: "Singapore", AU: "Australia", CA: "Canada", SA: "Saudi Arabia", NZ: "New Zealand", CH: "Switzerland",
};

export function currencyForCountry(country: string | null | undefined): string | null {
  return country ? COUNTRY_CURRENCY[country.toUpperCase()] ?? null : null;
}

/** Countries whose buyers see prices in this currency (when a price in it exists). */
export function countriesForCurrency(currency: string): string[] {
  return Object.entries(COUNTRY_CURRENCY).filter(([, c]) => c === currency).map(([k]) => k);
}

export function countryName(code: string) {
  return COUNTRY_NAMES[code] ?? (EUROZONE.includes(code) ? "the eurozone" : code);
}
