import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { everyGateway, fieldSources, gatewayConfig, gatewaysFor, hasKeys, storedSettings } from "@/lib/payments/registry";
import { AddCustomProvider, CustomDetails } from "./CustomProvider";
import { ProviderKeys, type ProviderView } from "./ProviderKeys";
import { env } from "@/lib/env";
import { Card } from "@/components/dash/Stat";
import { addRoute, deleteRoute, setRouteActive } from "./actions";

export const metadata: Metadata = { title: "Payments" };

// Providers without an adapter yet (src/lib/payments/gateways/_template.ts shows how to add one).
const PLANNED = [
  { name: "Telr / Network International (N-Genius) / Checkout.com", where: "UAE and GCC cards with local acquiring" },
  { name: "PayTabs", where: "Saudi Arabia, Egypt, Jordan" },
  { name: "Paymob", where: "Egypt, Pakistan" },
];

export default async function PaymentsPage({ searchParams }: PageProps<"/admin/payments">) {
  const me = await requireRole(["admin", "finance"], "/admin/payments");
  const sp = await searchParams;
  const testCountry = (typeof sp.country === "string" ? sp.country : "AE").toUpperCase().slice(0, 2);
  const testCurrency = (typeof sp.currency === "string" ? sp.currency : env.defaultCurrency).toUpperCase().slice(0, 3);
  const [{ data: routes }, offered] = await Promise.all([
    createAdminClient().from("payment_routes").select("*").order("priority"),
    gatewaysFor(testCountry, testCurrency),
  ]);
  const gws = await everyGateway();
  const label = (id: string) => gws.find((g) => g.id === id)?.name ?? id;
  const providers: ProviderView[] = await Promise.all(gws.filter((g) => g.fields.length).map(async (g) => {
    const [cfg, saved, sources] = await Promise.all([gatewayConfig(g.id), storedSettings(g.id), fieldSources(g.id)]);
    return {
      id: g.id, name: g.name, regions: g.regions, keysHelp: g.keysHelp, webhookEvents: g.webhookEvents, fields: g.fields,
      currencies: g.currencies, webhookUrl: `${env.siteUrl}/api/webhooks/payments/${g.id}`,
      sources, hints: saved?.secret_hints ?? {}, publicValues: saved?.public_values ?? {},
      enabled: cfg.enabled, hasKeys: hasKeys(g, cfg), savedHere: Boolean(saved?.updated_at && (Object.keys(saved.secret_hints).length || Object.keys(saved.public_values).length)),
      unreadable: saved ? !saved.readable : false, canEdit: me.roles.includes("admin"), isCustom: Boolean(g.custom),
    };
  }));
  const testMode = process.env.ALLOW_TEST_PAYMENTS === "true";

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-3xl font-bold text-primary">Payments</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted">
          Each buyer is sent to a payment provider based on their billing country and currency. The most specific route wins
          (country + currency, then country, then currency, then &ldquo;any&rdquo;), then the lowest priority number. Providers that
          aren&apos;t set up are skipped automatically.
        </p>
      </div>

      <Card title="Payment providers & API keys">
        <p className="-mt-1 mb-4 max-w-3xl text-sm text-muted">
          Add each provider&apos;s API keys here, press <b>Save &amp; test</b>, then route buyers to it below. Use the provider&apos;s
          test/sandbox keys first, buy a course end to end, then swap in the live keys.
        </p>
        <div className="grid gap-4 lg:grid-cols-2">
          {providers.map((p) => {
            const row = gws.find((g) => g.id === p.id)?.custom;
            return <ProviderKeys key={p.id} p={p} extra={row ? <CustomDetails row={row} /> : undefined} />;
          })}
        </div>
        {me.roles.includes("admin") && <div className="mt-4"><AddCustomProvider /></div>}
        {testMode && (
          <p className="mt-4 rounded-lg bg-warning/10 px-3 py-2 text-sm text-warning">
            Test payments are on (ALLOW_TEST_PAYMENTS=true in Vercel), so buyers can &ldquo;pay&rdquo; without money moving. Set it to false before launch.
          </p>
        )}
      </Card>

      <Card title="Which provider each buyer sees">
        <p className="-mt-1 mb-3 max-w-3xl text-sm text-muted">
          Rules matching a buyer&apos;s billing country and currency to a provider. The most specific rule wins (country + currency,
          then country, then currency, then &ldquo;any&rdquo;); a lower priority number is shown first. Leave country or currency blank for &ldquo;any&rdquo;.
        </p>
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
            <select name="gateway" className="fc-input w-48">{gws.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select>
          </label>
          <label className="grid gap-1">Priority<input name="priority" defaultValue={100} inputMode="numeric" className="fc-input w-24" /></label>
          <button className="fc-btn fc-btn-primary">Add rule</button>
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

      <Card title="Fully automatic integrations we can add">
        <ul className="grid gap-2 text-sm">
          {PLANNED.map((p) => <li key={p.name}><b>{p.name}</b> <span className="text-muted">· {p.where}. Built-in integration on request (until then, add it above as a payment-link provider).</span></li>)}
        </ul>
      </Card>
    </div>
  );
}
