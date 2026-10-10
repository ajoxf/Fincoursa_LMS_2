import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { minorUnitsFactor } from "@/lib/money";

const csv = (v: unknown) => {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) || /^[=+\-@]/.test(s) ? `"${s.replace(/"/g, '""').replace(/^([=+\-@])/, "'$1")}"` : s;
};

// The signed-in affiliate's commission statement as CSV.
export async function GET(request: NextRequest) {
  if (!(await getSessionUser())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const days = Math.min(3650, Math.max(1, Number(request.nextUrl.searchParams.get("days")) || 90));
  const { data, error } = await (await createClient()).rpc("affiliate_statement", { p_days: days });
  if (error) return NextResponse.json({ error: "not an affiliate" }, { status: 403 });
  const head = ["date", "order", "items", "client", "tier", "source", "campaign", "sale_net", "rate_pct", "commission", "currency", "status", "payable_on", "paid_on"];
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  const rows = (data ?? []).map((r: any) => {
    const f = minorUnitsFactor(r.currency);
    return [r.created_at?.slice(0, 10), r.order_number, r.items, r.client, r.tier, r.via, r.campaign, (r.sale_minor / f).toFixed(2), r.pct,
      (r.amount_minor / f).toFixed(2), r.currency, r.status, r.available_at?.slice(0, 10), r.paid_at?.slice(0, 10)].map(csv).join(",");
  });
  return new NextResponse([head.join(","), ...rows].join("\n"), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="fincoursa-commissions-${days}d.csv"` },
  });
}
