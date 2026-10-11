import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/format";
import { brand } from "@/components/site/brand";

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// UAE dirham is pegged to the US dollar; UAE rules require the VAT amount in AED on foreign-currency invoices.
const AED_PER = { USD: 3.6725 } as Record<string, number>;

const COUNTRY: Record<string, string> = {
  AE: "United Arab Emirates", SA: "Saudi Arabia", QA: "Qatar", KW: "Kuwait", BH: "Bahrain", OM: "Oman", EG: "Egypt",
  IN: "India", PK: "Pakistan", GB: "United Kingdom", US: "United States", SG: "Singapore",
};

/** Printable tax invoice in the FinCoursa theme (browser "Save as PDF"). Buyer sees own invoices; staff see all (RLS). */
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/invoices/[id]">) {
  const { id } = await ctx.params;
  if (!(await getSessionUser())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const supabase = await createClient();
  const { data: o } = await supabase
    .from("orders")
    .select("number, status, currency, subtotal_minor, discount_minor, tax_minor, total_minor, refunded_minor, tax_rate, billing_country, gateway, paid_at, created_at, user_id, order_items(title, unit_amount_minor, discount_minor, quantity)")
    .eq("id", id).maybeSingle();
  if (!o || o.status === "pending" || o.status === "failed") return NextResponse.json({ error: "not found" }, { status: 404 });
  const { data: buyer } = await supabase.from("profiles").select("full_name, email").eq("id", o.user_id).maybeSingle();

  const m = (n: number) => esc(formatMoney(n, o.currency));
  const seller = process.env.COMPANY_LEGAL_NAME ?? "FinCoursa Academy";
  const address = process.env.COMPANY_ADDRESS ?? "";
  const trn = process.env.COMPANY_TRN;
  const rate = Number(o.tax_rate) || 0;
  const pct = `${(rate * 100).toFixed(0)}%`;
  const items = o.order_items ?? [];
  // Prices are VAT-inclusive: split each line into taxable amount + VAT so the lines add up to the totals.
  const totalGross = items.reduce((n, i) => n + i.unit_amount_minor * i.quantity - (i.discount_minor ?? 0), 0) || 1;
  const lines = items.map((i) => {
    const gross = i.unit_amount_minor * i.quantity - (i.discount_minor ?? 0);
    const vat = Math.round((o.tax_minor * gross) / totalGross);
    return { ...i, gross, vat, net: gross - vat };
  });
  const net = o.total_minor - o.tax_minor;
  const aed = AED_PER[o.currency];
  const status = o.refunded_minor >= o.total_minor && o.total_minor > 0 ? "Refunded" : o.refunded_minor > 0 ? "Partly refunded" : "Paid";
  const issued = formatDate(o.paid_at ?? o.created_at);
  const title = trn ? "Tax Invoice" : "Invoice";

  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} ${o.number} | FinCoursa</title>
<link rel="stylesheet" href="https://api.fontshare.com/v2/css?f[]=satoshi@400,500,700&display=swap">
<style>
:root{--ink:#101827;--muted:#4b5563;--lime:#d6fd3b;--grey:#f3f4f6;--line:#e5e7eb}
*{box-sizing:border-box}
body{margin:0;background:var(--grey);color:var(--ink);font:15px/1.55 "Satoshi",ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;
  -webkit-print-color-adjust:exact;print-color-adjust:exact}
.page{max-width:820px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden}
.top{background:#000;color:#fff;padding:32px 40px;display:flex;justify-content:space-between;align-items:center;gap:24px}
.top img{height:30px;display:block}
.pill{display:inline-block;border:1px solid currentColor;border-radius:999px;padding:4px 14px;font-size:12px;font-weight:500;letter-spacing:.14em;text-transform:uppercase}
.pill.lime{color:var(--lime)}
.pill.paid{background:var(--lime);border-color:var(--lime);color:var(--ink)}
.pill.refund{color:#b7791f}
.body{padding:40px}
h1{font-weight:400;letter-spacing:-.03em;font-size:40px;line-height:1.1;margin:0}
.meta{display:flex;flex-wrap:wrap;gap:8px 32px;margin-top:14px;color:var(--muted)}
.meta b{color:var(--ink);font-weight:500}
.parties{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:32px}
.box{background:var(--grey);border-radius:12px;padding:20px}
.label{font-size:12px;font-weight:500;letter-spacing:.14em;text-transform:uppercase;color:var(--ink);margin:0 0 10px}
.box p{margin:0}
table{width:100%;border-collapse:collapse;margin-top:32px}
th{font-size:12px;font-weight:500;letter-spacing:.1em;text-transform:uppercase;text-align:left;padding:0 0 12px;border-bottom:1px solid var(--ink)}
td{padding:14px 0;border-bottom:1px solid var(--line);vertical-align:top}
.r{text-align:right}
td.r,th.r{padding-left:16px}
.totals{margin-left:auto;width:min(100%,360px);margin-top:24px}
.totals div{display:flex;justify-content:space-between;padding:6px 0}
.totals .grand{border-top:1px solid var(--ink);margin-top:8px;padding-top:16px;align-items:baseline}
.totals .grand span:last-child{font-size:30px;font-weight:700;letter-spacing:-.02em}
.muted{color:var(--muted)}
.note{margin-top:32px;font-size:13px;color:var(--muted)}
.foot{background:#000;color:rgba(255,255,255,.8);padding:18px 40px;font-size:13px;display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap}
.actions{max-width:820px;margin:24px auto -16px;display:flex;justify-content:flex-end;gap:8px;padding:0 16px}
.btn{font:inherit;font-weight:600;border:0;border-radius:8px;padding:12px 22px;background:var(--lime);color:var(--ink);cursor:pointer}
@media (max-width:640px){.top,.body,.foot{padding-left:20px;padding-right:20px}.parties{grid-template-columns:1fr}h1{font-size:32px}.page{margin:16px;border-radius:12px}}
@media print{@page{size:A4;margin:12mm}body{background:#fff}.page{margin:0;max-width:none;border-radius:0}.actions{display:none}}
</style></head><body>
<div class="actions"><button class="btn" onclick="print()">Print / Save PDF</button></div>
<div class="page">
  <div class="top">
    <img src="${esc(brand.logoFooter)}" alt="FinCoursa">
    <span class="pill lime">${title}</span>
  </div>
  <div class="body">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap">
      <h1>${title}</h1>
      <span class="pill ${status === "Paid" ? "paid" : "refund"}">${status}</span>
    </div>
    <div class="meta">
      <span>Invoice no. <b>#${esc(o.number)}</b></span>
      <span>Date of issue <b>${esc(issued)}</b></span>
      <span>Currency <b>${esc(o.currency)}</b></span>
    </div>

    <div class="parties">
      <div class="box">
        <p class="label">From</p>
        <p><b>${esc(seller)}</b></p>
        ${address ? `<p class="muted">${esc(address)}</p>` : ""}
        ${trn ? `<p class="muted">TRN ${esc(trn)}</p>` : ""}
      </div>
      <div class="box">
        <p class="label">Billed to</p>
        <p><b>${esc(buyer?.full_name || buyer?.email)}</b></p>
        <p class="muted">${esc(buyer?.email)}</p>
        ${o.billing_country ? `<p class="muted">${esc(COUNTRY[o.billing_country] ?? o.billing_country)}</p>` : ""}
      </div>
    </div>

    <table>
      <thead><tr><th>Description</th><th class="r">Qty</th><th class="r">Taxable amount</th><th class="r">VAT ${pct}</th><th class="r">Amount</th></tr></thead>
      <tbody>
      ${lines.map((l) => `<tr><td>${esc(l.title)}${l.discount_minor ? `<br><span class="muted">Price ${m(l.unit_amount_minor * l.quantity)} · discount −${m(l.discount_minor)}</span>` : ""}</td>
        <td class="r">${l.quantity}</td><td class="r">${m(l.net)}</td><td class="r">${m(l.vat)}</td><td class="r">${m(l.gross)}</td></tr>`).join("")}
      </tbody>
    </table>

    <div class="totals">
      <div><span>Subtotal</span><span>${m(o.subtotal_minor)}</span></div>
      ${o.discount_minor ? `<div><span>Discount</span><span>−${m(o.discount_minor)}</span></div>` : ""}
      <div><span>Taxable amount</span><span>${m(net)}</span></div>
      <div><span>VAT ${pct}</span><span>${m(o.tax_minor)}</span></div>
      ${aed && o.tax_minor ? `<div class="muted"><span>VAT in AED (1 ${esc(o.currency)} = ${aed} AED)</span><span>${esc(formatMoney(Math.round(o.tax_minor * aed), "AED"))}</span></div>` : ""}
      <div class="grand"><span>Total</span><span>${m(o.total_minor)}</span></div>
      ${o.refunded_minor ? `<div><span>Refunded</span><span>−${m(o.refunded_minor)}</span></div>` : ""}
      <div class="muted"><span>${status === "Paid" ? "Amount paid" : "Net paid"}</span><span>${m(o.total_minor - (o.refunded_minor ?? 0))}</span></div>
    </div>

    <p class="note">Prices include VAT where applicable. Digital course access, lifetime unless stated on the course page.${o.gateway && o.gateway !== "manual" && o.gateway !== "thinkific" ? ` Paid via ${esc(o.gateway[0].toUpperCase() + o.gateway.slice(1))}.` : ""}</p>
  </div>
  <div class="foot"><span>© ${new Date().getFullYear()} FinCoursa Academy</span><span>Questions about this invoice? Reply to your receipt email.</span></div>
</div>
</body></html>`;
  return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store" } });
}
