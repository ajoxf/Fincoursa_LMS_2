// Terms & Conditions and Privacy Policy: edited in Admin → Terms & privacy, shown on the public pages.
// Safe in the browser.

export type LegalKind = "terms" | "privacy";
export type LegalVersion = { body: string; updated_at: string; by?: string | null };
export type LegalDoc = {
  body: string;               // simple formatting: ## headings, - bullets, 1. lists, **bold**, [links](https://…)
  updated_at: string | null;  // shown as "Last updated" on the page
  by?: string | null;
  pdf_url?: string | null;    // optional downloadable PDF version
  pdf_name?: string | null;
  history?: LegalVersion[];   // earlier versions, newest first (kept for the record)
};

export const LEGAL: Record<LegalKind, { key: string; title: string; path: string }> = {
  terms: { key: "legal_terms", title: "Terms & Conditions", path: "/pages/terms-conditions" },
  privacy: { key: "legal_privacy", title: "Privacy Policy", path: "/pages/privacy-policy" },
};

export const EMPTY_LEGAL: LegalDoc = { body: "", updated_at: null, history: [] };
