import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { allGateways, gatewaysFor } from "@/lib/payments/registry";
import { env } from "@/lib/env";
import { Card } from "@/components/dash/Stat";
import { addRoute, deleteRoute, setRouteActive } from "./actions";

export const metadata: Metadata = { title: "Payments" };

// Providers commonly used by region; each needs an adapter (src/lib/payments/gateways) and its keys in Vercel.
const PLANNED = [
  { name: "Stripe", where: "Global cards, Apple Pay, Google Pay", status: "Built in. Add STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET." },
  { name: "Telr / Network International / Checkout.com", where: "UAE and GCC cards, local acquiring", status: "Adapter to add when you choose one." },
  { name: "Tap Payments", where: "GCC incl. KNET (Kuwait), mada (Saudi), Benefit (Bahrain)", status: "Adapter to add." },
  { name: "Razorpay", where: "India: UPI, cards, netbanking (INR)", status: "Adapter to add." },
  { name: "Paymob", where: "Egypt, Pakistan", status: "Adapter to add." },
  { name: "PayPal", where: "Global wallet", status: "Adapter to add." },
];

export default async function PaymentsPage({ searchParams }: PageProps<"/admin/payments">) {
  await requireRole(["admin", "finance"], "/admin/payments");
  const sp = await searchParams;
  const testCountry = (typeof sp.country === "string" ? sp.country : "AE").toUpperCase().slice(0, 2);
  const testCurrency = (typeof sp.currency === "string" ? sp.currency : env.defaultCurrency).toUpperCase().slice(0, 3);
  const [{ data: routes }, offered] = await Promise.all([
    createAdminClient().from("payment_routes").select("*").order("priority"),
    gatewaysFor(testCountry, testCurrency),
  ]);
  const gws = allGateways();
  const label = (id: string) => gws.find((g) => g.id === id)?.label ?? id;

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-3xl font-bold text-primary">Payments</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted">
          Each buyer is sent to a payment provider based on their billing country and currency. The most specific route wins
          (country + currency, then country, then currency, then &ldquo;any&rdquo;), then the lowest priority number. Providers that
          aren&apos;t connected are skipped automatically.
        </p>
      </div>

      <Card title="Connected providers">
        <div className="grid gap-3 sm:grid-cols-2">
          {gws.filter((g) => g.id !== "manual" || g.isConfigured()).map((g) => (
            <div key={g.id} className="rounded-card border border-line p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="font-semibold">{g.label}</p>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${g.isConfigured() ? "bg-success/15 text-success" : "bg-warning/15 text-warning"}`}>
                  {g.isConfigured() ? "Connected" : "Keys missing"}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted">Currencies: {g.currencies?.join(", ") ?? "any"} · id <code>{g.id}</code></p>
              {g.id !== "manual" && <p className="mt-1 break-all text-xs text-muted">Webhook URL: {env.siteUrl}/api/webhooks/payments/{g.id}</p>}
              {g.id === "manual" && <p className="mt-1 text-xs text-warning">Test mode is on (ALLOW_TEST_PAYMENTS). Turn it off before launch.</p>}
            </div>
          ))}
        </div>
      </Card>

      <Card title="Routes">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="text-left text-muted"><tr>{["Buyer country", "Currency", "Provider", "Priority", "Status", ""].map((h) => <th key={h} className="p-2 font-medium">{h}</th>)}</tr></thead>
            <tbody>
              {(routes ?? []).map((r) => (
                <tr key={r.id} className={`border-t border-line ${r.is_active ? "" : "text-muted"}`}>
                  <td className="p-2">{r.country_code ?? "Any country"}</td>
                  <td className="p-2">{r.currency ?? "Any"}</td>
                  <td className="p-2 font-medium">{label(r.gateway)}</td>
                  <td className="p-2 tabular-nums">{r.priority}</td>
                  <td className="p-2">{r.is_active ? "Active" : "Paused"}</td>
                  <td className="p-2 text-right">
                    <form className="flex justify-end gap-3">
                      <button formAction={setRouteActive.bind(null, r.id, !r.is_active)} className="text-xs underline">{r.is_active ? "Pause" : "Resume"}</button>
                      <button formAction={deleteRoute.bind(null, r.id)} className="text-xs text-danger underline">Delete</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <form action={addRoute} className="mt-4 flex flex-wrap items-end gap-3 border-t border-line pt-4 text-sm">
          <label className="grid gap-1">Buyer country<input name="country_code" maxLength={3} placeholder="Any, or e.g. AE" className="fc-input w-36 uppercase" /></label>
          <label className="grid gap-1">Currency<input name="currency" maxLength={3} placeholder="Any, or e.g. USD" className="fc-input w-36 uppercase" /></label>
          <label className="grid gap-1">Provider
            <select name="gateway" className="fc-input w-48">{gws.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}</select>
          </label>
          <label className="grid gap-1">Priority<input name="priority" defaultValue={100} inputMode="numeric" className="fc-input w-24" /></label>
          <button className="fc-btn fc-btn-primary">Add route</button>
        </form>
      </Card>

      <Card title="Check what a buyer sees">
        <form className="flex flex-wrap items-end gap-3 text-sm">
          <label className="grid gap-1">Country<input name="country" defaultValue={testCountry} maxLength={2} className="fc-input w-24 uppercase" /></label>
          <label className="grid gap-1">Currency<input name="currency" defaultValue={testCurrency} maxLength={3} className="fc-input w-24 uppercase" /></label>
          <button className="fc-btn fc-btn-outline">Check</button>
        </form>
        <p className="mt-3 text-sm">
          A buyer in <b>{testCountry}</b> paying in <b>{testCurrency}</b> is offered:{" "}
          {offered.length ? <b>{offered.map((g) => g.label).join(", then ")}</b> : <span className="text-danger">no payment method (they can&apos;t check out)</span>}
        </p>
      </Card>

      <Card title="Adding providers for your regions">
        <ul className="grid gap-2 text-sm">
          {PLANNED.map((p) => <li key={p.name}><b>{p.name}</b> <span className="text-muted">· {p.where}. {p.status}</span></li>)}
        </ul>
      </Card>
    </div>
  );
}
