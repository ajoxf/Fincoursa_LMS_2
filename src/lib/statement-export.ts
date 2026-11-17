import "server-only";
import ExcelJS from "exceljs";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { EARN_STATUS, type Earning } from "@/lib/instructor-statement";
import { minorUnitsFactor } from "@/lib/money";
import type { CashbackSplit } from "@/lib/cashback-status";

/**
 * Admin downloads of the FinCoursa View for one instructor (Excel, CSV, PDF): what their courses made for FinCoursa,
 * what it cost (gateway fees, partner commissions, the full cashback given), the instructor's share and the net margin.
 * Built from the per-sale statement rows, so it matches the Dashboard (FinCoursa View). No student details.
 */
export type StatementMeta = {
  instructor: string; scope: string; currency: string; generated: string;
  /** PNG bytes of the FinCoursa logo: white for the PDF's black header band, dark for the Excel sheet */
  logoWhite?: Uint8Array | null; logoDark?: Uint8Array | null;
};

/** Fetch a logo image for the downloads; null if it can't be loaded (the files then show the name in text). */
export async function fetchLogo(url: string | null | undefined): Promise<Uint8Array | null> {
  if (!url) return null;
  try {
    const r = await fetch(url, { cache: "force-cache" });
    return r.ok ? new Uint8Array(await r.arrayBuffer()) : null;
  } catch { return null; }
}

const amt = (n: number | null | undefined, c: string) => Number(n ?? 0) / minorUnitsFactor(c) + 0; // + 0 turns -0 into 0
const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Where each sale's cashback stands (used / open / expired), keyed by sale id; set per download. */
let CB: Map<string, CashbackSplit> = new Map();

/** FinCoursa's figures for one sale (minor units). margin = worst case (all cashback spent); actual = only what was spent. */
function sale(e: Earning) {
  const revenue = Number(e.net_revenue_minor), fee = Number(e.payment_fee_minor), partner = Number(e.partner_minor);
  const cashback = Number(e.cashback_given_minor || e.cashback_minor), instructor = Number(e.amount_minor);
  const st = CB.get(e.id);
  const used = st ? st.used : cashback, open = st ? st.open : 0, expired = st ? st.expired : 0;
  return { revenue, fee, partner, cashback, used, open, expired, instructor, margin: revenue - fee - partner - cashback - instructor, actual: revenue - fee - partner - used - instructor };
}

/** Totals for a set of sales, refunded sales left out. */
export function fincoursaTotals(rows: Earning[]) {
  const live = rows.filter((e) => e.status !== "reversed");
  const z = { revenue: 0, fee: 0, partner: 0, cashback: 0, used: 0, open: 0, expired: 0, instructor: 0, margin: 0, actual: 0 };
  for (const e of live) { const s = sale(e); for (const k of Object.keys(z) as (keyof typeof z)[]) z[k] += s[k]; }
  return {
    ...z,
    paidSales: live.filter((e) => Number(e.net_revenue_minor) > 0).length,
    free: live.filter((e) => Number(e.net_revenue_minor) === 0).length,
    refunded: rows.length - live.length,
  };
}

function byCourse(rows: Earning[]) {
  const map = new Map<string, Earning[]>();
  for (const e of rows) { const k = e.course?.title ?? "Course"; map.set(k, [...(map.get(k) ?? []), e]); }
  return [...map.entries()].map(([title, list]) => ({ title, ...fincoursaTotals(list) })).sort((a, b) => b.revenue - a.revenue);
}

const dateOf = (d: string) => new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Dubai" });

export function fincoursaCsv(rows: Earning[], cb?: Map<string, CashbackSplit>) {
  if (cb) CB = cb;
  const cell = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const head = ["Date", "Course", "Currency", "Gross Revenue", "Gateway Fees", "Commissions", "Cashback Given", "Cashback Used", "Cashback Open", "Cashback Expired", "Instructor Share", "Net Margin (Worst Case)", "Net Margin (Actual)", "Status"];
  const lines = rows.map((e) => {
    const s = sale(e), c = e.currency;
    return [e.created_at.slice(0, 10), e.course?.title ?? "", c, amt(s.revenue, c).toFixed(2), amt(s.fee, c).toFixed(2), amt(s.partner, c).toFixed(2),
      amt(s.cashback, c).toFixed(2), amt(s.used, c).toFixed(2), amt(s.open, c).toFixed(2), amt(s.expired, c).toFixed(2), amt(s.instructor, c).toFixed(2),
      amt(s.margin, c).toFixed(2), amt(s.actual, c).toFixed(2), EARN_STATUS[e.status] ?? e.status].map(cell).join(",");
  });
  return [head.map(cell).join(","), ...lines].join("\n");
}

export async function fincoursaXlsx(rows: Earning[], meta: StatementMeta, cb?: Map<string, CashbackSplit>): Promise<Buffer> {
  if (cb) CB = cb;
  const wb = new ExcelJS.Workbook();
  wb.creator = "FinCoursa";
  const t = fincoursaTotals(rows);
  const c = meta.currency;
  const money = "#,##0.00;[Red]-#,##0.00";

  const sum = wb.addWorksheet("Summary");
  sum.columns = [{ width: 34 }, { width: 18 }];
  if (meta.logoDark) {
    const img = wb.addImage({ buffer: Buffer.from(meta.logoDark) as unknown as ExcelJS.Buffer, extension: "png" });
    sum.addRow([]); sum.addRow([]); sum.addRow([]);
    sum.addImage(img, { tl: { col: 0, row: 0 }, ext: { width: 180, height: 35 } });
  }
  sum.addRow([`${FINCOURSA_TITLE}: ${meta.instructor}`]).font = { bold: true, size: 14 };
  sum.addRow([FINCOURSA_TAG]).font = { italic: true, color: { argb: "FFB91C1C" } };
  sum.addRow([`Period: ${meta.scope}`]);
  sum.addRow([`Generated: ${meta.generated}`]);
  sum.addRow([]);
  const lines: [string, number, boolean?][] = [
    ["Paid Sales", t.paidSales], ["Free Enrolments", t.free], ["Refunded", t.refunded],
    [`Gross Revenue (${c})`, amt(t.revenue, c), true], [`Gateway Fees (${c})`, -amt(t.fee, c), true], [`Commissions (${c})`, -amt(t.partner, c), true],
    [`Cashback Given (${c})`, -amt(t.cashback, c), true], [`Instructor Share (${c})`, -amt(t.instructor, c), true], [`Net Margin, Worst Case (${c})`, amt(t.margin, c), true],
    [`  Cashback Used (${c})`, amt(t.used, c), true], [`  Cashback Open (${c})`, amt(t.open, c), true], [`  Cashback Expired (${c})`, amt(t.expired, c), true],
    [`Net Margin, Actual (${c})`, amt(t.actual, c), true],
  ];
  for (const [k, v, isMoney] of lines) { const r = sum.addRow([k, v]); if (isMoney) r.getCell(2).numFmt = money; }
  sum.getRow(sum.rowCount).font = { bold: true };

  const bc = wb.addWorksheet("By Course");
  bc.addRow(["Course", "Paid Sales", "Free Enrolments", "Gross Revenue", "Gateway Fees", "Commissions", "Cashback Given", "Cashback Used", "Cashback Open", "Cashback Expired", "Instructor Share", "Net Margin (Worst Case)", "Net Margin (Actual)"]).font = { bold: true };
  for (const r of byCourse(rows)) bc.addRow([r.title, r.paidSales, r.free, amt(r.revenue, c), amt(r.fee, c), amt(r.partner, c), amt(r.cashback, c), amt(r.used, c), amt(r.open, c), amt(r.expired, c), amt(r.instructor, c), amt(r.margin, c), amt(r.actual, c)]);
  bc.columns.forEach((col, i) => { col.width = [36, 11, 15, 14, 13, 13, 14, 14, 14, 16, 16, 22, 18][i]; if (i >= 3) col.numFmt = money; });

  const ws = wb.addWorksheet("Sales");
  ws.addRow(["Date", "Course", "Currency", "Gross Revenue", "Gateway Fees", "Commissions", "Cashback Given", "Cashback Used", "Cashback Open", "Cashback Expired", "Instructor Share", "Net Margin (Worst Case)", "Net Margin (Actual)", "Status"]).font = { bold: true };
  ws.views = [{ state: "frozen", ySplit: 1 }];
  for (const e of rows) {
    const s = sale(e), cc = e.currency;
    ws.addRow([new Date(e.created_at), e.course?.title ?? "", cc, amt(s.revenue, cc), amt(s.fee, cc), amt(s.partner, cc), amt(s.cashback, cc), amt(s.used, cc), amt(s.open, cc), amt(s.expired, cc), amt(s.instructor, cc), amt(s.margin, cc), amt(s.actual, cc), EARN_STATUS[e.status] ?? e.status]);
  }
  ws.columns.forEach((col, i) => { col.width = [12, 36, 9, 14, 13, 13, 14, 14, 14, 16, 16, 22, 18, 20][i]; if (i === 0) col.numFmt = "dd mmm yyyy"; else if (i >= 3 && i <= 12) col.numFmt = money; });
  return Buffer.from(await wb.xlsx.writeBuffer());
}

type PdfCol<T> = { h: string; w: number; right?: boolean; v: (r: T) => string; pad?: number };
type PdfTable = { title: string; cols: PdfCol<never>[]; data: unknown[]; grey?: (r: never) => boolean; total?: string[] };
/** A summary line: label, amount in minor units (NaN = a note line with no amount), bold. */
type SumLine = [string, number, boolean?];

/** A4 landscape statement PDF: black header band with the logo and title, the summary box, tables, footnote. Standard fonts only. */
async function statementPdf(spec: {
  title: string; tag?: string; meta: StatementMeta; subline: string; summary: SumLine[]; tables: PdfTable[]; footnote: string;
}): Promise<Uint8Array> {
  const { meta } = spec;
  const doc = await PDFDocument.create();
  doc.setTitle(`${spec.title}: ${meta.instructor}`);
  doc.setAuthor("FinCoursa");
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const W = 842, H = 595, M = 36;
  const ink = rgb(0.06, 0.09, 0.15), muted = rgb(0.42, 0.45, 0.5), line = rgb(0.86, 0.87, 0.89), lime = rgb(0.84, 0.99, 0.23), red = rgb(0.75, 0.1, 0.1);
  const c = meta.currency;
  const clean = (s: string) => s.replace(/[^\x20-\x7E\u00A0-\u00FF]/g, "-");
  const text = (p: PDFPage, s: string, x: number, y: number, o: { f?: PDFFont; size?: number; color?: ReturnType<typeof rgb>; right?: boolean; maxW?: number } = {}) => {
    const f = o.f ?? font, size = o.size ?? 9;
    let str = clean(s);
    if (o.maxW && f.widthOfTextAtSize(str, size) > o.maxW) {
      let base = str;
      while (base.length > 1 && f.widthOfTextAtSize(`${base}...`, size) > o.maxW) base = base.slice(0, -1);
      str = `${base.trimEnd()}...`;
    }
    const w = f.widthOfTextAtSize(str, size);
    p.drawText(str, { x: o.right ? x - w : x, y, size, font: f, color: o.color ?? ink });
  };

  let page = doc.addPage([W, H]);
  page.drawRectangle({ x: 0, y: H - 70, width: W, height: 70, color: rgb(0, 0, 0) });
  page.drawRectangle({ x: 0, y: H - 74, width: W, height: 4, color: lime });
  const logo = meta.logoWhite ? await doc.embedPng(meta.logoWhite).catch(() => null) : null;
  if (logo) { const h = 26, w = (logo.width / logo.height) * h; page.drawImage(logo, { x: M, y: H - 35 - h / 2, width: w, height: h }); }
  else text(page, "FinCoursa", M, H - 42, { f: bold, size: 20, color: rgb(1, 1, 1) });
  text(page, spec.title, W - M, spec.tag ? H - 32 : H - 38, { f: bold, size: 12, color: lime, right: true });
  if (spec.tag) text(page, spec.tag, W - M, H - 48, { size: 8, color: rgb(1, 1, 1), right: true });
  text(page, meta.instructor, M, H - 104, { f: bold, size: 16 });
  text(page, spec.subline, M, H - 122, { size: 9, color: muted });

  // summary, currency in its own column so the amounts line up
  let y = H - 152;
  const sumLines = spec.summary;
  page.drawRectangle({ x: M, y: y - (sumLines.length - 1) * 16 - 8, width: 330, height: (sumLines.length - 1) * 16 + 24, color: rgb(0.95, 0.96, 0.97) });
  for (const [k, v, b] of sumLines) {
    if (Number.isNaN(v)) { text(page, k, M + 10, y, { size: 8.5, color: muted }); y -= 16; continue; }
    const col = b && v < 0 ? red : ink;
    text(page, k, M + 10, y, { f: b ? bold : font, size: 10 });
    text(page, c, M + 236, y, { f: b ? bold : font, size: 10, color: col });
    text(page, fmt(amt(v, c)), M + 320, y, { f: b ? bold : font, size: 10, right: true, color: col });
    y -= 16;
  }

  for (const tb of spec.tables) {
    const cols = tb.cols as PdfCol<unknown>[];
    const grey = (tb.grey ?? (() => false)) as (r: unknown) => boolean;
    const head = (p: PDFPage, yy: number) => {
      let x = M;
      for (const col of cols) { text(p, col.h, col.right ? x + col.w - 4 : x + (col.pad ?? 0), yy, { f: bold, size: 8, color: muted, right: col.right }); x += col.w; }
      p.drawLine({ start: { x: M, y: yy - 5 }, end: { x: W - M, y: yy - 5 }, thickness: 1, color: ink });
      return yy - 18;
    };
    if (y < M + 90) { page = doc.addPage([W, H]); y = H - M; }
    y -= 22;
    text(page, tb.data.length ? tb.title : `${tb.title}: none in this period.`, M, y, { f: bold, size: 11 });
    y -= 20;
    if (!tb.data.length) continue;
    y = head(page, y);
    const row = (vals: string[], o: { f?: PDFFont; color?: ReturnType<typeof rgb> } = {}) => {
      if (y < M + 30) { page = doc.addPage([W, H]); y = head(page, H - M); }
      let x = M;
      cols.forEach((col, i) => { const pad = col.pad ?? 0; text(page, vals[i], col.right ? x + col.w - 4 : x + pad, y, { size: 8, right: col.right, maxW: col.w - 6 - pad, f: o.f, color: o.color }); x += col.w; });
      page.drawLine({ start: { x: M, y: y - 5 }, end: { x: W - M, y: y - 5 }, thickness: 0.5, color: line });
      y -= 16;
    };
    for (const r of tb.data) row(cols.map((col) => col.v(r)), { color: grey(r) ? muted : undefined });
    if (tb.total) row(tb.total, { f: bold });
  }

  const pages = doc.getPages();
  pages.forEach((p, i) => {
    text(p, spec.footnote, M, 18, { size: 7, color: muted, maxW: W - 2 * M - 60 });
    text(p, `Page ${i + 1} of ${pages.length}`, W - M, 18, { size: 7, color: muted, right: true });
  });
  return doc.save();
}

export const FINCOURSA_TITLE = "FinCoursa Margin Statement";
export const FINCOURSA_TAG = "Internal: not to be shared with the instructor";

/** The FinCoursa View as a PDF: what the instructor's courses made for FinCoursa. Internal only. */
export async function fincoursaPdf(rows: Earning[], meta: StatementMeta, cb?: Map<string, CashbackSplit>): Promise<Uint8Array> {
  if (cb) CB = cb;
  const c = meta.currency;
  const t = fincoursaTotals(rows);
  const courses = byCourse(rows);
  const m = (n: number) => fmt(amt(n, c));
  type CR = (typeof courses)[number];
  return statementPdf({
    title: FINCOURSA_TITLE, tag: FINCOURSA_TAG, meta,
    subline: `Period: ${meta.scope}   |   Generated: ${meta.generated}   |   Amounts in ${c}, excluding tax`,
    summary: [
      [`Gross Revenue (${t.paidSales} paid, ${t.free} free)`, t.revenue], ["- Gateway Fees", -t.fee], ["- Commissions", -t.partner],
      ["- Cashback Given", -t.cashback], ["- Instructor Share", -t.instructor], ["= Net Margin (Worst Case)", t.margin, true],
      [`   Cashback: used ${m(t.used)}, open ${m(t.open)}, expired ${m(t.expired)}`, NaN],
      ["= Net Margin (Actual)", t.actual, true],
    ],
    tables: [
      {
        title: "By Course", data: courses,
        cols: [
          { h: "Course", w: 170, v: (r: CR) => r.title }, { h: "Paid Sales", w: 56, right: true, v: (r: CR) => String(r.paidSales) },
          { h: "Free", w: 40, right: true, v: (r: CR) => String(r.free) }, { h: "Gross Revenue", w: 74, right: true, v: (r: CR) => m(r.revenue) },
          { h: "Gateway Fees", w: 66, right: true, v: (r: CR) => m(r.fee) }, { h: "Commissions", w: 66, right: true, v: (r: CR) => m(r.partner) },
          { h: "Cashback", w: 58, right: true, v: (r: CR) => m(r.cashback) }, { h: "Used", w: 50, right: true, v: (r: CR) => m(r.used) },
          { h: "Instructor", w: 58, right: true, v: (r: CR) => m(r.instructor) },
          { h: "Margin (Worst)", w: 68, right: true, v: (r: CR) => m(r.margin) }, { h: "Margin (Actual)", w: 70, right: true, v: (r: CR) => m(r.actual) },
        ] as PdfCol<never>[],
        total: courses.length > 1 ? ["Total", String(t.paidSales), String(t.free), m(t.revenue), m(t.fee), m(t.partner), m(t.cashback), m(t.used), m(t.instructor), m(t.margin), m(t.actual)] : undefined,
      },
      {
        title: "Every Sale", data: rows, grey: ((e: Earning) => e.status === "reversed") as (r: never) => boolean,
        cols: [
          { h: "Date", w: 60, v: (e: Earning) => dateOf(e.created_at) }, { h: "Course", w: 140, v: (e: Earning) => e.course?.title ?? "" },
          { h: "Gross Revenue", w: 66, right: true, v: (e: Earning) => fmt(amt(sale(e).revenue, e.currency)) }, { h: "Fees", w: 44, right: true, v: (e: Earning) => fmt(amt(sale(e).fee, e.currency)) },
          { h: "Commissions", w: 58, right: true, v: (e: Earning) => fmt(amt(sale(e).partner, e.currency)) }, { h: "Cashback", w: 52, right: true, v: (e: Earning) => fmt(amt(sale(e).cashback, e.currency)) },
          { h: "Used", w: 46, right: true, v: (e: Earning) => fmt(amt(sale(e).used, e.currency)) },
          { h: "Instructor", w: 54, right: true, v: (e: Earning) => fmt(amt(sale(e).instructor, e.currency)) }, { h: "Margin (Worst)", w: 66, right: true, v: (e: Earning) => fmt(amt(sale(e).margin, e.currency)) },
          { h: "Margin (Actual)", w: 70, right: true, v: (e: Earning) => fmt(amt(sale(e).actual, e.currency)) },
          { h: "Status", w: 114, pad: 10, v: (e: Earning) => EARN_STATUS[e.status] ?? e.status },
        ] as PdfCol<never>[],
      },
    ],
    footnote: "Internal. Gross Revenue: what students paid after codes and credit, excl. tax. Worst Case counts all cashback given; Actual only cashback spent. Refunded sales greyed, not in totals.",
  });
}

/* ------------------------------------------------------------------------------------------------------------------
 * The instructor's own statement (Excel, CSV, PDF): only what applies to them. From what students paid, the costs taken
 * off before sharing (gateway fee, partner commission, the counted part of cashback), the amount shared, their share
 * and their earnings, with payout status. No FinCoursa margin, no cashback lifecycle, no student details.
 * ---------------------------------------------------------------------------------------------------------------- */
export const INSTRUCTOR_TITLE = "Instructor Earnings Statement";

function mine(e: Earning) {
  const list = Number(e.list_minor ?? e.net_revenue_minor), paid = Number(e.net_revenue_minor);
  const discounts = Math.max(0, Number(e.code_discount_minor) + Number(e.credit_used_minor));
  const fee = Number(e.payment_fee_minor), partner = Number(e.partner_minor), cashback = Number(e.cashback_minor);
  const shared = Number(e.shared_minor ?? paid), earned = Number(e.amount_minor);
  return { list, discounts, paid, fee, partner, cashback, costs: fee + partner + cashback, shared, share: Number(e.share_pct), earned };
}

export function instructorTotals(rows: Earning[]) {
  const live = rows.filter((e) => e.status !== "reversed");
  const z = { list: 0, discounts: 0, paid: 0, fee: 0, partner: 0, cashback: 0, costs: 0, shared: 0, earned: 0 };
  for (const e of live) { const s = mine(e); for (const k of Object.keys(z) as (keyof typeof z)[]) z[k] += s[k]; }
  const byStatus = (st: string) => live.filter((e) => e.status === st).reduce((a, e) => a + Number(e.amount_minor), 0);
  const shares = [...new Set(live.map((e) => Number(e.share_pct)))];
  const feePcts = [...new Set(live.filter((e) => Number(e.payment_fee_minor) > 0).map((e) => Number(e.payment_fee_pct)))];
  const cbPcts = [...new Set(live.filter((e) => Number(e.cashback_minor) > 0).map((e) => Number(e.cashback_counted_pct)))];
  return { ...z, sales: live.length, refunded: rows.length - live.length, pending: byStatus("pending"), approved: byStatus("approved"), paidOut: byStatus("paid"), shares, feePcts, cbPcts };
}

function instructorByCourse(rows: Earning[]) {
  const map = new Map<string, Earning[]>();
  for (const e of rows) { const k = e.course?.title ?? "Course"; map.set(k, [...(map.get(k) ?? []), e]); }
  return [...map.entries()].map(([title, list]) => ({ title, ...instructorTotals(list) })).sort((a, b) => b.paid - a.paid);
}

const pctList = (xs: number[]) => (xs.length ? xs.map((x) => `${x}%`).join(" / ") : "");

const INSTR_SALE_HEAD = ["Date", "Course", "Currency", "List Price", "Discounts", "Paid (excl. tax)", "Gateway Fee", "Partner Commission", "Cashback Deduction",
  "Amount Shared", "Your Share %", "Your Earnings", "Status", "Payable From"];

export function instructorCsv(rows: Earning[]) {
  const cell = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const lines = rows.map((e) => {
    const s = mine(e), c = e.currency, a = (n: number) => amt(n, c).toFixed(2);
    return [e.created_at.slice(0, 10), e.course?.title ?? "", c, a(s.list), a(s.discounts), a(s.paid), a(s.fee), a(s.partner), a(s.cashback), a(s.shared), s.share, a(s.earned),
      EARN_STATUS[e.status] ?? e.status, e.available_at ? e.available_at.slice(0, 10) : ""].map(cell).join(",");
  });
  return [INSTR_SALE_HEAD.map(cell).join(","), ...lines].join("\n");
}

export async function instructorXlsx(rows: Earning[], meta: StatementMeta): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "FinCoursa";
  const t = instructorTotals(rows);
  const c = meta.currency;
  const money = "#,##0.00;[Red]-#,##0.00";

  const sum = wb.addWorksheet("Summary");
  sum.columns = [{ width: 40 }, { width: 18 }];
  if (meta.logoDark) {
    const img = wb.addImage({ buffer: Buffer.from(meta.logoDark) as unknown as ExcelJS.Buffer, extension: "png" });
    sum.addRow([]); sum.addRow([]); sum.addRow([]);
    sum.addImage(img, { tl: { col: 0, row: 0 }, ext: { width: 180, height: 35 } });
  }
  sum.addRow([`${INSTRUCTOR_TITLE}: ${meta.instructor}`]).font = { bold: true, size: 14 };
  sum.addRow([`Period: ${meta.scope}`]);
  sum.addRow([`Generated: ${meta.generated}`]);
  sum.addRow([]);
  const lines: [string, number | string, boolean?, boolean?][] = [
    ["Sales", t.sales], ["Refunded (not counted)", t.refunded],
    [`Paid by Students, excl. tax (${c})`, amt(t.paid, c), true],
    [`Gateway Fees${t.feePcts.length ? ` at ${pctList(t.feePcts)}` : ""} (${c})`, -amt(t.fee, c), true],
    [`Partner Commissions (${c})`, -amt(t.partner, c), true],
    [`Cashback Deduction${t.cbPcts.length ? `, ${pctList(t.cbPcts)} counted` : ""} (${c})`, -amt(t.cashback, c), true],
    [`Amount Shared (${c})`, amt(t.shared, c), true],
    ["Your Revenue Share", pctList(t.shares) || "-"],
    [`Your Earnings (${c})`, amt(t.earned, c), true, true],
    [], 
    [`In Refund Window (${c})`, amt(t.pending, c), true], [`Ready for Payout (${c})`, amt(t.approved, c), true], [`Paid Out (${c})`, amt(t.paidOut, c), true],
  ] as [string, number | string, boolean?, boolean?][];
  for (const [k, v, isMoney, isBold] of lines) {
    const r = sum.addRow(k === undefined ? [] : [k, v]);
    if (isMoney) r.getCell(2).numFmt = money;
    if (isBold) r.font = { bold: true };
  }

  const bc = wb.addWorksheet("By Course");
  bc.addRow(["Course", "Sales", "Paid (excl. tax)", "Costs Taken Off", "Amount Shared", "Your Share %", "Your Earnings"]).font = { bold: true };
  for (const r of instructorByCourse(rows)) bc.addRow([r.title, r.sales, amt(r.paid, c), -amt(r.costs, c), amt(r.shared, c), pctList(r.shares), amt(r.earned, c)]);
  bc.columns.forEach((col, i) => { col.width = [36, 8, 16, 16, 16, 13, 15][i]; if ([2, 3, 4, 6].includes(i)) col.numFmt = money; });

  const ws = wb.addWorksheet("Sales");
  ws.addRow(INSTR_SALE_HEAD).font = { bold: true };
  ws.views = [{ state: "frozen", ySplit: 1 }];
  for (const e of rows) {
    const s = mine(e), cc = e.currency, a = (n: number) => amt(n, cc);
    ws.addRow([new Date(e.created_at), e.course?.title ?? "", cc, a(s.list), a(s.discounts), a(s.paid), a(s.fee), a(s.partner), a(s.cashback), a(s.shared), s.share, a(s.earned),
      EARN_STATUS[e.status] ?? e.status, e.available_at ? new Date(e.available_at) : ""]);
  }
  ws.columns.forEach((col, i) => {
    col.width = [12, 36, 9, 11, 11, 15, 12, 18, 18, 15, 12, 14, 20, 13][i];
    if (i === 0 || i === 13) col.numFmt = "dd mmm yyyy"; else if (i >= 3 && i <= 11 && i !== 10) col.numFmt = money;
  });
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export async function instructorPdf(rows: Earning[], meta: StatementMeta): Promise<Uint8Array> {
  const c = meta.currency;
  const t = instructorTotals(rows);
  const courses = instructorByCourse(rows);
  const m = (n: number) => fmt(amt(n, c));
  type CR = (typeof courses)[number];
  return statementPdf({
    title: INSTRUCTOR_TITLE, meta,
    subline: `Period: ${meta.scope}   |   Generated: ${meta.generated}   |   Amounts in ${c}, excluding tax`,
    summary: [
      [`Paid by Students (${t.sales} ${t.sales === 1 ? "sale" : "sales"})`, t.paid],
      [`- Gateway Fees${t.feePcts.length ? ` (${pctList(t.feePcts)})` : ""}`, -t.fee],
      ["- Partner Commissions", -t.partner],
      [`- Cashback Deduction${t.cbPcts.length ? ` (${pctList(t.cbPcts)} counted)` : ""}`, -t.cashback],
      ["= Amount Shared", t.shared, true],
      [`   Your revenue share: ${pctList(t.shares) || "-"}`, NaN],
      ["= Your Earnings", t.earned, true],
      [`   In refund window ${m(t.pending)}  |  Ready for payout ${m(t.approved)}  |  Paid out ${m(t.paidOut)}`, NaN],
    ],
    tables: [
      ...(courses.length > 1 ? [{
        title: "By Course", data: courses,
        cols: [
          { h: "Course", w: 250, v: (r: CR) => r.title }, { h: "Sales", w: 50, right: true, v: (r: CR) => String(r.sales) },
          { h: "Paid (excl. tax)", w: 90, right: true, v: (r: CR) => m(r.paid) }, { h: "Costs Taken Off", w: 90, right: true, v: (r: CR) => (r.costs ? `-${m(r.costs)}` : "0.00") },
          { h: "Amount Shared", w: 90, right: true, v: (r: CR) => m(r.shared) }, { h: "Your Share", w: 70, right: true, v: (r: CR) => pctList(r.shares) || "-" },
          { h: "Your Earnings", w: 90, right: true, v: (r: CR) => m(r.earned) },
        ] as PdfCol<never>[],
        total: ["Total", String(t.sales), m(t.paid), t.costs ? `-${m(t.costs)}` : "0.00", m(t.shared), "", m(t.earned)],
      }] : []),
      {
        title: "Every Sale", data: rows, grey: ((e: Earning) => e.status === "reversed") as (r: never) => boolean,
        cols: [
          { h: "Date", w: 58, v: (e: Earning) => dateOf(e.created_at) }, { h: "Course", w: 130, v: (e: Earning) => e.course?.title ?? "" },
          { h: "List Price", w: 50, right: true, v: (e: Earning) => fmt(amt(mine(e).list, e.currency)) },
          { h: "Discounts", w: 50, right: true, v: (e: Earning) => fmt(amt(mine(e).discounts, e.currency)) },
          { h: "Paid", w: 48, right: true, v: (e: Earning) => fmt(amt(mine(e).paid, e.currency)) },
          { h: "Fee", w: 40, right: true, v: (e: Earning) => fmt(amt(mine(e).fee, e.currency)) },
          { h: "Commission", w: 54, right: true, v: (e: Earning) => fmt(amt(mine(e).partner, e.currency)) },
          { h: "Cashback", w: 48, right: true, v: (e: Earning) => fmt(amt(mine(e).cashback, e.currency)) },
          { h: "Shared", w: 50, right: true, v: (e: Earning) => fmt(amt(mine(e).shared, e.currency)) },
          { h: "Share", w: 34, right: true, v: (e: Earning) => `${mine(e).share}%` },
          { h: "Earnings", w: 52, right: true, v: (e: Earning) => fmt(amt(mine(e).earned, e.currency)) },
          { h: "Status", w: 98, pad: 10, v: (e: Earning) => EARN_STATUS[e.status] ?? e.status },
          { h: "Payable From", w: 58, v: (e: Earning) => (e.available_at ? dateOf(e.available_at) : "") },
        ] as PdfCol<never>[],
      },
    ],
    footnote: "Paid: after codes and credit, excl. tax. Taken off before sharing: gateway fee, partner commission, counted part of cashback. Payable 30 days after the sale. Refunded sales greyed, not counted.",
  });
}
