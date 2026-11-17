import "server-only";
import ExcelJS from "exceljs";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { EARN_STATUS, summarize, type Earning } from "@/lib/instructor-statement";
import { minorUnitsFactor } from "@/lib/money";

/** Admin downloads of an instructor's earnings statement: Excel and PDF (CSV lives in instructor-statement.ts). */
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

const amt = (n: number | null | undefined, c: string) => Number(n ?? 0) / minorUnitsFactor(c);
const money = (n: number, c: string) => `${c} ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export async function statementXlsx(rows: Earning[], meta: StatementMeta): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "FinCoursa";
  const t = summarize(rows);
  const c = meta.currency;

  const sum = wb.addWorksheet("Summary");
  sum.columns = [{ width: 34 }, { width: 18 }];
  if (meta.logoDark) {
    // logo across the top rows (733 x 144 source, shown at about 180 x 35)
    const img = wb.addImage({ buffer: Buffer.from(meta.logoDark) as unknown as ExcelJS.Buffer, extension: "png" });
    sum.addRow([]); sum.addRow([]); sum.addRow([]);
    sum.addImage(img, { tl: { col: 0, row: 0 }, ext: { width: 180, height: 35 } });
  }
  sum.addRow([`Instructor Earnings Statement: ${meta.instructor}`]).font = { bold: true, size: 14 };
  sum.addRow([`Period: ${meta.scope}`]);
  sum.addRow([`Generated: ${meta.generated}`]);
  sum.addRow([]);
  const lines: [string, number | string][] = [
    ["Sales", t.sales],
    [`Gross Revenue (${c})`, amt(t.paid, c)],
    [`Gateway Fees (${c})`, -amt(t.fee, c)],
    [`Partner Commissions (${c})`, -amt(t.partner, c)],
    [`Cashback Deduction (${c})`, -amt(t.cashback, c)],
    [`Shared Amount (${c})`, amt(t.shared, c)],
    [`Instructor Earnings (${c})`, amt(t.earned, c)],
  ];
  for (const [k, v] of lines) {
    const r = sum.addRow([k, v]);
    if (typeof v === "number" && k !== "Sales") r.getCell(2).numFmt = "#,##0.00;[Red]-#,##0.00";
  }
  sum.getRow(sum.rowCount).font = { bold: true };

  const ws = wb.addWorksheet("Sales");
  const head = ["Date", "Course", "Currency", "List Price", "Code Discount", "Credit Used", "Gross Revenue", "Gateway Fee %", "Gateway Fees",
    "Commissions", "Cashback Given", "Cashback Counted %", "Cashback Deduction", "Shared Amount", "Revenue Share %", "Instructor Earnings", "Status", "Payable From"];
  ws.addRow(head).font = { bold: true };
  ws.views = [{ state: "frozen", ySplit: 1 }];
  for (const e of rows) {
    ws.addRow([
      new Date(e.created_at), e.course?.title ?? "", e.currency, amt(e.list_minor, e.currency), amt(e.code_discount_minor, e.currency), amt(e.credit_used_minor, e.currency),
      amt(e.net_revenue_minor, e.currency), Number(e.payment_fee_pct), amt(e.payment_fee_minor, e.currency), amt(e.partner_minor, e.currency),
      amt(e.cashback_given_minor, e.currency), Number(e.cashback_counted_pct), amt(e.cashback_minor, e.currency), amt(e.shared_minor ?? e.net_revenue_minor, e.currency),
      Number(e.share_pct), amt(e.amount_minor, e.currency), EARN_STATUS[e.status] ?? e.status, e.available_at ? new Date(e.available_at) : null,
    ]);
  }
  ws.columns.forEach((col, i) => {
    col.width = [12, 34, 9, 12, 13, 12, 14, 13, 13, 13, 14, 16, 17, 14, 15, 17, 20, 13][i];
    if ([0, 17].includes(i)) col.numFmt = "dd mmm yyyy";
    else if (i >= 3 && i <= 15 && ![7, 11, 14].includes(i)) col.numFmt = "#,##0.00";
  });
  if (rows.length) {
    const n = rows.length + 1;
    const r = ws.addRow(["Total"]);
    for (const col of [7, 9, 10, 11, 13, 14, 16]) r.getCell(col).value = { formula: `SUM(${ws.getColumn(col).letter}2:${ws.getColumn(col).letter}${n})` };
    r.font = { bold: true };
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** A4 landscape PDF: header, summary waterfall, then every sale. Standard fonts only (no student details). */
export async function statementPdf(rows: Earning[], meta: StatementMeta): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Instructor Earnings Statement: ${meta.instructor}`);
  doc.setAuthor("FinCoursa");
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const W = 842, H = 595, M = 36;
  const ink = rgb(0.06, 0.09, 0.15), muted = rgb(0.42, 0.45, 0.5), line = rgb(0.86, 0.87, 0.89), lime = rgb(0.84, 0.99, 0.23);
  const c = meta.currency;
  const t = summarize(rows);
  // standard fonts can't draw every character: keep text to plain Latin
  const clean = (s: string) => s.replace(/[^\x20-\x7E -ÿ]/g, "-");
  const text = (p: PDFPage, s: string, x: number, y: number, o: { f?: PDFFont; size?: number; color?: ReturnType<typeof rgb>; right?: boolean; maxW?: number } = {}) => {
    const f = o.f ?? font, size = o.size ?? 9;
    let str = clean(s);
    if (o.maxW && f.widthOfTextAtSize(str, size) > o.maxW) {
      // shorten until it fits, ending with "..."
      let base = str;
      while (base.length > 1 && f.widthOfTextAtSize(`${base}...`, size) > o.maxW) base = base.slice(0, -1);
      str = `${base.trimEnd()}...`;
    }
    const w = f.widthOfTextAtSize(str, size);
    p.drawText(str, { x: o.right ? x - w : x, y, size, font: f, color: o.color ?? ink });
  };

  let page = doc.addPage([W, H]);
  // header band
  page.drawRectangle({ x: 0, y: H - 70, width: W, height: 70, color: rgb(0, 0, 0) });
  page.drawRectangle({ x: 0, y: H - 74, width: W, height: 4, color: lime });
  const logo = meta.logoWhite ? await doc.embedPng(meta.logoWhite).catch(() => null) : null;
  if (logo) {
    const h = 26, w = (logo.width / logo.height) * h;
    page.drawImage(logo, { x: M, y: H - 35 - h / 2, width: w, height: h });
  } else {
    text(page, "FinCoursa", M, H - 42, { f: bold, size: 20, color: rgb(1, 1, 1) });
  }
  text(page, "Instructor Earnings Statement", W - M, H - 38, { f: bold, size: 12, color: lime, right: true });
  text(page, meta.instructor, M, H - 104, { f: bold, size: 16 });
  text(page, `Period: ${meta.scope}   |   Generated: ${meta.generated}   |   Amounts in ${c}, excluding tax`, M, H - 122, { size: 9, color: muted });

  // summary waterfall
  let y = H - 152;
  const sumLines: [string, number, boolean?][] = [
    [`Gross Revenue (${t.sales} ${t.sales === 1 ? "sale" : "sales"})`, t.paid],
    ["- Gateway Fees", -t.fee], ["- Partner Commissions", -t.partner], ["- Cashback Deduction", -t.cashback],
    ["= Shared Amount", t.shared, true], ["= Instructor Earnings", t.earned, true],
  ];
  page.drawRectangle({ x: M, y: y - (sumLines.length - 1) * 16 - 8, width: 330, height: (sumLines.length - 1) * 16 + 24, color: rgb(0.95, 0.96, 0.97) });
  for (const [k, v, b] of sumLines) {
    text(page, k, M + 10, y, { f: b ? bold : font, size: 10 });
    text(page, money(amt(v, c), c), M + 320, y, { f: b ? bold : font, size: 10, right: true });
    y -= 16;
  }

  // sales table
  const cols: { h: string; w: number; right?: boolean; v: (e: Earning) => string }[] = [
    { h: "Date", w: 62, v: (e) => new Date(e.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Dubai" }) },
    { h: "Course", w: 150, v: (e) => e.course?.title ?? "" },
    { h: "Gross Revenue", w: 66, right: true, v: (e) => amt(e.net_revenue_minor, e.currency).toFixed(2) },
    { h: "Gateway Fees", w: 60, right: true, v: (e) => amt(e.payment_fee_minor, e.currency).toFixed(2) },
    { h: "Commissions", w: 60, right: true, v: (e) => amt(e.partner_minor, e.currency).toFixed(2) },
    { h: "Cashback", w: 58, right: true, v: (e) => amt(e.cashback_minor, e.currency).toFixed(2) },
    { h: "Shared", w: 58, right: true, v: (e) => amt(e.shared_minor ?? e.net_revenue_minor, e.currency).toFixed(2) },
    { h: "Share %", w: 44, right: true, v: (e) => `${Number(e.share_pct)}%` },
    { h: "Earnings", w: 60, right: true, v: (e) => amt(e.amount_minor, e.currency).toFixed(2) },
    { h: "Status", w: 152, v: (e) => (EARN_STATUS[e.status] ?? e.status) + (e.status === "pending" && e.available_at ? ` (payable ${new Date(e.available_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })})` : "") },
  ];
  const tableHead = (p: PDFPage, yy: number) => {
    let x = M;
    for (const col of cols) { text(p, col.h, col.right ? x + col.w - 4 : x + (col.h === "Status" ? 12 : 0), yy, { f: bold, size: 8, color: muted, right: col.right }); x += col.w; }
    p.drawLine({ start: { x: M, y: yy - 5 }, end: { x: W - M, y: yy - 5 }, thickness: 1, color: ink });
    return yy - 18;
  };
  y -= 22;
  text(page, rows.length ? "Every Sale" : "No sales in this period.", M, y, { f: bold, size: 11 });
  y -= 20;
  if (rows.length) y = tableHead(page, y);
  for (const e of rows) {
    if (y < M + 30) { page = doc.addPage([W, H]); y = tableHead(page, H - M); }
    let x = M;
    const gray = e.status === "reversed" ? muted : undefined;
    for (const col of cols) { const pad = col.h === "Status" ? 12 : 0; text(page, col.v(e), col.right ? x + col.w - 4 : x + pad, y, { size: 8, right: col.right, maxW: col.w - 6 - pad, color: gray }); x += col.w; }
    page.drawLine({ start: { x: M, y: y - 5 }, end: { x: W - M, y: y - 5 }, thickness: 0.5, color: line });
    y -= 16;
  }
  // footer on every page
  const pages = doc.getPages();
  pages.forEach((p, i) => {
    text(p, "Gross Revenue: what students paid after codes and credit, excluding tax. Refunded sales are excluded from totals. No student details are included.", M, 18, { size: 7, color: muted });
    text(p, `Page ${i + 1} of ${pages.length}`, W - M, 18, { size: 7, color: muted, right: true });
  });
  return doc.save();
}
