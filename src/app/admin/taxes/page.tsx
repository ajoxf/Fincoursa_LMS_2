import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card } from "@/components/dash/Stat";
import { daysAgoIso } from "@/lib/format";
import { saveTaxRate, setTaxActive } from "./actions";

export const metadata: Metadata = { title: "Taxes" };

type Rate = { country_code: string; name: string; label: string | null; rate: number; prices_include_tax: boolean; reverse_charge: boolean; is_active: boolean };

export default async function TaxesPage() {
  await requireRole(["admin", "finance"], "/admin/taxes");
  const db = createAdminClient();
  const [{ data: rates }, { data: sales }] = await Promise.all([
    db.from("tax_rates").select("*").order("country_code"),
    db.from("orders").select("billing_country, tax_minor, total_minor, currency").in("status", ["paid", "partially_refunded"])
      .gte("paid_at", daysAgoIso(365)),
  ]);
  const byCountry = new Map<string, { orders: number; tax: number }>();
  (sales ?? []).forEach((o) => {
    const k = o.billing_country ?? "??"; const v = byCountry.get(k) ?? { orders: 0, tax: 0 };
    byCountry.set(k, { orders: v.orders + 1, tax: v.tax + Number(o.tax_minor) });
  });
  const list = ((rates ?? []) as Rate[]).sort((a, b) => Number(b.is_active) - Number(a.is_active) || a.country_code.localeCompare(b.country_code));
  const untaxed = [...byCountry.entries()].filter(([c]) => !list.some((r) => r.country_code === c && r.is_active)).sort((a, b) => b[1].orders - a[1].orders);

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-3xl font-bold text-primary">Taxes</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted">
          Tax is charged by the buyer&apos;s billing country, only for countries switched <b>on</b> here. Turn a country on once FinCoursa is registered
          there. Rates are the standard rates for digital services; confirm them with your tax adviser. Each order keeps the rate it was sold at.
        </p>
      </div>

      {untaxed.length > 0 && (
        <Card title="Where you sell without charging tax (last 12 months)">
          <p className="mb-3 text-sm text-muted">Useful for spotting countries where you may need to register.</p>
          <div className="flex flex-wrap gap-2 text-sm">
            {untaxed.map(([c, v]) => <span key={c} className="rounded-full bg-surface px-3 py-1">{c} · {v.orders} orders</span>)}
          </div>
        </Card>
      )}

      <Card title="Countries">
        <div className="overflow-x-auto">
          <div className="min-w-[900px] text-sm">
            <div className="grid grid-cols-[50px_minmax(140px,1.4fr)_70px_80px_100px_120px_80px_150px] gap-2 px-2 pb-2 text-muted">
              {["Country", "Name on invoice", "Short", "Rate %", "Price incl. tax", "Reverse charge (B2B)", "Charging", ""].map((h) => <span key={h} className="font-medium">{h}</span>)}
            </div>
            {list.map((r) => (
              <form key={r.country_code} action={saveTaxRate} className={`grid grid-cols-[50px_minmax(140px,1.4fr)_70px_80px_100px_120px_80px_150px] items-center gap-2 border-t border-line p-2 ${r.is_active ? "" : "text-muted"}`}>
                <input type="hidden" name="country_code" value={r.country_code} />
                <span className="font-semibold text-ink">{r.country_code}</span>
                <input name="name" defaultValue={r.name} aria-label="Name on invoice" className="fc-input !py-1.5" />
                <input name="label" defaultValue={r.label ?? "VAT"} aria-label="Short name" className="fc-input !py-1.5 uppercase" />
                <input name="rate" defaultValue={+(Number(r.rate) * 100).toFixed(2)} inputMode="decimal" aria-label="Rate percent" className="fc-input !py-1.5" />
                <label className="flex items-center gap-2"><input type="checkbox" name="prices_include_tax" defaultChecked={r.prices_include_tax} /> Included</label>
                <label className="flex items-center gap-2"><input type="checkbox" name="reverse_charge" defaultChecked={r.reverse_charge} /> With tax ID</label>
                <label className="flex items-center gap-2"><input type="checkbox" name="is_active" defaultChecked={r.is_active} /> <span className={r.is_active ? "font-semibold text-success" : ""}>{r.is_active ? "On" : "Off"}</span></label>
                <span className="flex items-center gap-3">
                  <button className="fc-btn fc-btn-dark !min-w-0 !px-3 !py-1.5 text-xs">Save</button>
                  <button formAction={setTaxActive.bind(null, r.country_code, !r.is_active)} className="text-xs underline">{r.is_active ? "Turn off" : "Turn on"}</button>
                </span>
              </form>
            ))}
          </div>
        </div>
      </Card>

      <Card title="Add a country">
        <form action={saveTaxRate} className="flex flex-wrap items-end gap-3 text-sm">
          <label className="grid gap-1">Country code<input name="country_code" required maxLength={2} placeholder="e.g. JP" className="fc-input w-24 uppercase" /></label>
          <label className="grid gap-1">Name on invoice<input name="name" required placeholder="e.g. Japan JCT" className="fc-input w-48" /></label>
          <label className="grid gap-1">Short<input name="label" placeholder="VAT" className="fc-input w-20 uppercase" /></label>
          <label className="grid gap-1">Rate %<input name="rate" required inputMode="decimal" placeholder="10" className="fc-input w-20" /></label>
          <label className="flex items-center gap-2 pb-3"><input type="checkbox" name="prices_include_tax" defaultChecked /> Price includes tax</label>
          <label className="flex items-center gap-2 pb-3"><input type="checkbox" name="reverse_charge" /> Reverse charge</label>
          <label className="flex items-center gap-2 pb-3"><input type="checkbox" name="is_active" /> Charge now</label>
          <button className="fc-btn fc-btn-primary">Add country</button>
        </form>
      </Card>
    </div>
  );
}
