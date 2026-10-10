import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/format";

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// Printable tax invoice (browser "Save as PDF"). Buyer sees own invoices; staff see all (RLS).
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/invoices/[id]">) {
  const { id } = await ctx.params;
  if (!(await getSessionUser())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const supabase = await createClient();
  const { data: o } = await supabase
    .from("orders")
    .select("number, status, currency, subtotal_minor, discount_minor, tax_minor, total_minor, refunded_minor, tax_rate, billing_country, paid_at, created_at, user_id, order_items(title, unit_amount_minor, discount_minor, quantity)")
    .eq("id", id).maybeSingle();
  if (!o || o.status === "pending" || o.status === "failed") return NextResponse.json({ error: "not found" }, { status: 404 });
  const { data: buyer } = await supabase.from("profiles").select("full_name, email").eq("id", o.user_id).maybeSingle();
  const m = (n: number) => esc(formatMoney(n, o.currency));
  const seller = process.env.COMPANY_LEGAL_NAME ?? "FinCoursa Academy";
  const address = process.env.COMPANY_ADDRESS ?? "";
  const trn = process.env.COMPANY_TRN;

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Invoice ${o.number}</title>
<style>body{font-family:system-ui,sans-serif;max-width:720px;margin:40px auto;padding:0 16px;color:#1b2533}
table{width:100%;border-collapse:collapse;margin-top:24px}td,th{padding:8px;border-bottom:1px solid #e3e6eb;text-align:left}
.r{text-align:right}.muted{color:#5b6676}h1{margin:0}@media print{button{display:none}}</style></head><body>
<button onclick="print()" style="float:right">Print / Save PDF</button>
<h1>${trn ? "Tax Invoice" : "Invoice"}</h1>
<p class="muted">Invoice #${o.number} · ${esc(formatDate(o.paid_at ?? o.created_at))}</p>
<p><strong>${esc(seller)}</strong><br>${esc(address)}${trn ? `<br>TRN: ${esc(trn)}` : ""}</p>
<p>Billed to: ${esc(buyer?.full_name || buyer?.email)}<br>${esc(buyer?.email)}${o.billing_country ? `<br>${esc(o.billing_country)}` : ""}</p>
<table><tr><th>Item</th><th class="r">Qty</th><th class="r">Amount</th></tr>
${(o.order_items ?? []).map((i) => `<tr><td>${esc(i.title)}</td><td class="r">${i.quantity}</td><td class="r">${m(i.unit_amount_minor * i.quantity)}</td></tr>`).join("")}
${o.discount_minor ? `<tr><td colspan="2">Discount</td><td class="r">−${m(o.discount_minor)}</td></tr>` : ""}
<tr><td colspan="2">VAT ${(Number(o.tax_rate) * 100).toFixed(0)}% (included)</td><td class="r">${m(o.tax_minor)}</td></tr>
<tr><th colspan="2">Total</th><th class="r">${m(o.total_minor)}</th></tr>
${o.refunded_minor ? `<tr><td colspan="2">Refunded</td><td class="r">−${m(o.refunded_minor)}</td></tr>` : ""}
</table></body></html>`;
  return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
