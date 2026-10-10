// Thinkific export column detection. Covers the CSV export headers ("Percentage Completed") and the
// API field names ("percentage_completed"), because both appear depending on where the data comes from.
export type Kind = "users" | "enrollments" | "orders";

// "Date Joined (UTC)" → "datejoined"
const norm = (h: string) => h.toLowerCase().replace(/\(?\butc\b\)?/g, "").replace(/[^a-z0-9]/g, "");

export const FIELDS: Record<Kind, Record<string, { label: string; aliases: string[]; required?: boolean }>> = {
  users: {
    email: { label: "Email", aliases: ["email", "useremail", "emailaddress", "studentemail"], required: true },
    first: { label: "First name", aliases: ["firstname", "first", "givenname"] },
    last: { label: "Last name", aliases: ["lastname", "last", "surname", "familyname"] },
    full: { label: "Full name", aliases: ["fullname", "name", "username", "studentname"] },
    joined: { label: "Date joined", aliases: ["datejoined", "createdat", "signupdate", "joined", "dateregistered", "registeredat"] },
  },
  enrollments: {
    email: { label: "Student email", aliases: ["useremail", "email", "studentemail", "emailaddress"], required: true },
    name: { label: "Student name", aliases: ["username", "studentname", "name", "fullname"] },
    course: { label: "Course name", aliases: ["coursename", "course", "coursetitle", "productname", "product"], required: true },
    pct: { label: "Percentage completed", aliases: ["percentagecompleted", "percentcompleted", "completionpercentage", "progress", "completion", "progresspercentage"] },
    started: { label: "Enrolled on", aliases: ["startedat", "enrollmentdate", "enrolledat", "activatedat", "datestarted", "createdat", "enrolled"] },
    completed: { label: "Completed on", aliases: ["completedat", "completiondate", "datecompleted"] },
    expires: { label: "Access expires", aliases: ["expirydate", "expiresat", "expirationdate", "accessexpiry", "expiry"] },
  },
  orders: {
    id: { label: "Order ID", aliases: ["orderid", "id", "ordernumber", "order"], required: true },
    date: { label: "Order date", aliases: ["createdat", "date", "orderdate", "purchasedate", "purchasedat"] },
    email: { label: "Customer email", aliases: ["useremail", "email", "customeremail", "buyeremail", "studentemail"], required: true },
    name: { label: "Customer name", aliases: ["username", "customername", "buyername", "name"] },
    product: { label: "Product", aliases: ["productname", "product", "coursename", "item", "itemname"], required: true },
    amount: { label: "Amount", aliases: ["amountdollars", "amount", "total", "ordertotal", "amountpaid", "price", "netamount"] },
    amountCents: { label: "Amount (cents)", aliases: ["amountcents"] },
    currency: { label: "Currency", aliases: ["currency", "currencycode"] },
    coupon: { label: "Coupon", aliases: ["couponcode", "coupon", "discountcode"] },
    affiliate: { label: "Affiliate code", aliases: ["affiliatereferralcode", "affiliatecode", "affiliate", "referralcode"] },
    status: { label: "Status", aliases: ["status", "orderstatus"] },
  },
};

/** Map our field keys to the matching header in the file. */
export function detectColumns(kind: Kind, headers: string[]): Record<string, string | null> {
  const byNorm = new Map(headers.map((h) => [norm(h), h]));
  const out: Record<string, string | null> = {};
  for (const [key, f] of Object.entries(FIELDS[kind])) {
    out[key] = f.aliases.map((a) => byNorm.get(a)).find(Boolean) ?? null;
  }
  return out;
}

export function missingRequired(kind: Kind, map: Record<string, string | null>) {
  return Object.entries(FIELDS[kind]).filter(([k, f]) => f.required && !map[k]).map(([, f]) => f.label);
}

export const titleKey = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").trim();

/** Dates in exports come as ISO, "2024-03-05 10:22:11 UTC", or "03/05/2024". Returns ISO or null. */
export function parseDate(v: unknown): string | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const iso = Date.parse(s.replace(" UTC", "Z").replace(/^(\d{4}-\d{2}-\d{2}) (\d)/, "$1T$2"));
  if (!isNaN(iso)) return new Date(iso).toISOString();
  const m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/);
  if (m) {
    // ambiguous dd/mm vs mm/dd: Thinkific uses US mm/dd; if the first part > 12 it must be dd/mm
    const [a, b, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const [mm, dd] = a > 12 ? [b, a] : [a, b];
    return new Date(Date.UTC(y, mm - 1, dd)).toISOString();
  }
  return null;
}

export function parsePct(v: unknown): number {
  const n = parseFloat(String(v ?? "").replace("%", ""));
  if (isNaN(n)) return 0;
  return Math.max(0, Math.min(100, n <= 1 && String(v).includes(".") && !String(v).includes("%") ? n * 100 : n));
}

export function parseAmountMinor(amount: unknown, cents: unknown): number {
  const c = parseInt(String(cents ?? "").replace(/[^\d-]/g, ""), 10);
  if (!isNaN(c)) return c;
  const a = parseFloat(String(amount ?? "").replace(/[^\d.-]/g, ""));
  return isNaN(a) ? 0 : Math.round(a * 100);
}
