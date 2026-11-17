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
  sum.addRow([`Instructor Earnings Statement: ${meta.instructor}`]).font = { bold: true, size: 14 };
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

/** A4 landscape PDF: header with logo, the summary, the by-course table and every sale. Standard fonts only. */
export async function fincoursaPdf(rows: Earning[], meta: StatementMeta, cb?: Map<string, CashbackSplit>): Promise<Uint8Array> {
  if (cb) CB = cb;
  const doc = await PDFDocument.create();
  doc.setTitle(`Instructor Earnings Statement: ${meta.instructor}`);
  doc.setAuthor("FinCoursa");
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const W = 842, H = 595, M = 36;
  const ink = rgb(0.06, 0.09, 0.15), muted = rgb(0.42, 0.45, 0.5), line = rgb(0.86, 0.87, 0.89), lime = rgb(0.84, 0.99, 0.23), red = rgb(0.75, 0.1, 0.1);
  const c = meta.currency;
  const t = fincoursaTotals(rows);
  const clean = (s: string) => s.replace(/[^\x20-\x7E -ÿ]/g, "-");
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
  text(page, "Instructor Earnings Statement", W - M, H - 38, { f: bold, size: 12, color: lime, right: true });
  text(page, meta.instructor, M, H - 104, { f: bold, size: 16 });
  text(page, `Period: ${meta.scope}   |   Generated: ${meta.generated}   |   Amounts in ${c}, excluding tax`, M, H - 122, { size: 9, color: muted });

  // summary, currency in its own column so the amounts line up
  let y = H - 152;
  const sumLines: [string, number, boolean?][] = [
    [`Gross Revenue (${t.paidSales} paid, ${t.free} free)`, t.revenue], ["- Gateway Fees", -t.fee], ["- Commissions", -t.partner],
    ["- Cashback Given", -t.cashback], ["- Instructor Share", -t.instructor], ["= Net Margin (Worst Case)", t.margin, true],
    [`   Cashback: used ${fmt(amt(t.used, c))}, open ${fmt(amt(t.open, c))}, expired ${fmt(amt(t.expired, c))}`, NaN],
    ["= Net Margin (Actual)", t.actual, true],
  ];
  page.drawRectangle({ x: M, y: y - (sumLines.length - 1) * 16 - 8, width: 330, height: (sumLines.length - 1) * 16 + 24, color: rgb(0.95, 0.96, 0.97) });
  for (const [k, v, b] of sumLines) {
    const col = b && v < 0 ? red : ink;
    if (Number.isNaN(v)) { text(page, k, M + 10, y, { size: 8.5, color: muted }); y -= 16; continue; }
    text(page, k, M + 10, y, { f: b ? bold : font, size: 10 });
    text(page, c, M + 236, y, { f: b ? bold : font, size: 10, color: col });
    text(page, fmt(amt(v, c)), M + 320, y, { f: b ? bold : font, size: 10, right: true, color: col });
    y -= 16;
  }

  type Col<T> = { h: string; w: number; right?: boolean; v: (r: T) => string; pad?: number };
  const table = <T,>(title: string, cols: Col<T>[], data: T[], grey: (r: T) => boolean, total?: string[]) => {
    const head = (p: PDFPage, yy: number) => {
      let x = M;
      for (const col of cols) { text(p, col.h, col.right ? x + col.w - 4 : x + (col.pad ?? 0), yy, { f: bold, size: 8, color: muted, right: col.right }); x += col.w; }
      p.drawLine({ start: { x: M, y: yy - 5 }, end: { x: W - M, y: yy - 5 }, thickness: 1, color: ink });
      return yy - 18;
    };
    if (y < M + 90) { page = doc.addPage([W, H]); y = H - M; }
    y -= 22;
    text(page, data.length ? title : `${title}: none in this period.`, M, y, { f: bold, size: 11 });
    y -= 20;
    if (!data.length) return;
    y = head(page, y);
    const row = (vals: string[], o: { f?: PDFFont; color?: ReturnType<typeof rgb> } = {}) => {
      if (y < M + 30) { page = doc.addPage([W, H]); y = head(page, H - M); }
      let x = M;
      cols.forEach((col, i) => { const pad = col.pad ?? 0; text(page, vals[i], col.right ? x + col.w - 4 : x + pad, y, { size: 8, right: col.right, maxW: col.w - 6 - pad, f: o.f, color: o.color }); x += col.w; });
      page.drawLine({ start: { x: M, y: y - 5 }, end: { x: W - M, y: y - 5 }, thickness: 0.5, color: line });
      y -= 16;
    };
    for (const r of data) row(cols.map((col) => col.v(r)), { color: grey(r) ? muted : undefined });
    if (total) row(total, { f: bold });
  };

  const courses = byCourse(rows);
  const m = (n: number) => fmt(amt(n, c));
  table("By Course", [
    { h: "Course", w: 170, v: (r) => r.title }, { h: "Paid Sales", w: 56, right: true, v: (r) => String(r.paidSales) },
    { h: "Free", w: 40, right: true, v: (r) => String(r.free) }, { h: "Gross Revenue", w: 74, right: true, v: (r) => m(r.revenue) },
    { h: "Gateway Fees", w: 66, right: true, v: (r) => m(r.fee) }, { h: "Commissions", w: 66, right: true, v: (r) => m(r.partner) },
    { h: "Cashback", w: 58, right: true, v: (r) => m(r.cashback) }, { h: "Used", w: 50, right: true, v: (r) => m(r.used) },
    { h: "Instructor", w: 58, right: true, v: (r) => m(r.instructor) },
    { h: "Margin (Worst)", w: 68, right: true, v: (r) => m(r.margin) }, { h: "Margin (Actual)", w: 70, right: true, v: (r) => m(r.actual) },
  ] as Col<(typeof courses)[number]>[], courses, () => false,
  courses.length > 1 ? ["Total", String(t.paidSales), String(t.free), m(t.revenue), m(t.fee), m(t.partner), m(t.cashback), m(t.used), m(t.instructor), m(t.margin), m(t.actual)] : undefined);

  table("Every Sale", [
    { h: "Date", w: 60, v: (e) => dateOf(e.created_at) }, { h: "Course", w: 140, v: (e) => e.course?.title ?? "" },
    { h: "Gross Revenue", w: 66, right: true, v: (e) => fmt(amt(sale(e).revenue, e.currency)) }, { h: "Fees", w: 44, right: true, v: (e) => fmt(amt(sale(e).fee, e.currency)) },
    { h: "Commissions", w: 58, right: true, v: (e) => fmt(amt(sale(e).partner, e.currency)) }, { h: "Cashback", w: 52, right: true, v: (e) => fmt(amt(sale(e).cashback, e.currency)) },
    { h: "Used", w: 46, right: true, v: (e) => fmt(amt(sale(e).used, e.currency)) },
    { h: "Instructor", w: 54, right: true, v: (e) => fmt(amt(sale(e).instructor, e.currency)) }, { h: "Margin (Worst)", w: 66, right: true, v: (e) => fmt(amt(sale(e).margin, e.currency)) },
    { h: "Margin (Actual)", w: 70, right: true, v: (e) => fmt(amt(sale(e).actual, e.currency)) },
    { h: "Status", w: 114, pad: 10, v: (e) => EARN_STATUS[e.status] ?? e.status },
  ] as Col<Earning>[], rows, (e) => e.status === "reversed");

  const pages = doc.getPages();
  pages.forEach((p, i) => {
    text(p, "Gross Revenue: what students paid after codes and credit, excluding tax. Worst Case counts all cashback given; Actual counts only cashback spent (expired credit costs nothing). Refunded sales greyed, not in totals. No student details.", M, 18, { size: 7, color: muted });
    text(p, `Page ${i + 1} of ${pages.length}`, W - M, 18, { size: 7, color: muted, right: true });
  });
  return doc.save();
}
