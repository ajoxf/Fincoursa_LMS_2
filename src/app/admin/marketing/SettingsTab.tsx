import Link from "next/link";
import { getTracking } from "@/lib/tracking";
import { Card } from "@/components/dash/Stat";
import { saveTracking } from "./actions";
import { saveGrowthSettings } from "./growth-actions";
import { getGrowthSettings } from "@/lib/growth";
import { getReportSettings } from "@/lib/marketing-metrics";
import { saveReportSettings } from "./campaign-actions";

/** Admin → Marketing → Settings: reporting currency, institution pricing and LinkedIn. Emails live in Emails & updates. */
export async function SettingsTab() {
  const [g, rep, t] = await Promise.all([getGrowthSettings(), getReportSettings(), getTracking()]);

  return (
    <div className="grid gap-6">
      <p className="rounded-lg bg-surface p-3 text-sm">Automatic emails (checkout reminder, offer closing, welcome sequence) and the institution emails are in{" "}
        <Link href="/admin/emails?tab=automatic" className="underline">Emails &amp; updates</Link>.</p>
      <Card title="Reporting currency">
        <form action={saveReportSettings} className="grid gap-3 text-sm">
          <p className="text-muted">Overview shows everything in US dollars. Set how many units of each currency equal 1 US dollar (update monthly).</p>
          <div className="flex flex-wrap gap-4">
            {Object.entries(rep.fx).filter(([c]) => c !== "USD").map(([c, v]) => (
              <label key={c} className="flex items-center gap-2">1 USD = <input name={`fx_${c}`} defaultValue={v} inputMode="decimal" className="fc-input w-20 !py-1.5" /> {c}</label>
            ))}
          </div>
          <button className="fc-btn fc-btn-dark justify-self-start !min-w-0 !px-5 !py-2">Save rates</button>
        </form>
      </Card>

      <Card title="Selling to institutions">
        <form action={saveGrowthSettings} className="grid gap-5 text-sm">
          <p className="text-muted">Used for every institution enquiry: the proposal and quote, the free pilot, and when organisations are flagged.</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1">Team email (new-lead alerts go here; replies from leads come here)<input name="team_email" type="email" defaultValue={g.team_email} className="fc-input" /></label>
            <label className="grid gap-1">Meeting booking link (optional)<input name="booking_url" type="url" defaultValue={g.booking_url} placeholder="https://calendly.com/…" className="fc-input" /></label>
          </div>
          <fieldset className="grid gap-3 rounded-lg border border-line p-4">
            <legend className="px-1 font-medium">Team pricing (per person, per course)</legend>
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2">US$<input name="price_usd" inputMode="decimal" defaultValue={(g.seat_price.USD ?? 0) / 100} className="fc-input w-24 !py-1.5" /></label>
              <label className="flex items-center gap-2">₹ (India)<input name="price_inr" inputMode="decimal" defaultValue={(g.seat_price.INR ?? 0) / 100} className="fc-input w-28 !py-1.5" /></label>
            </div>
            <div className="flex flex-wrap gap-4">
              {[0, 1, 2].map((i) => (
                <span key={i} className="flex items-center gap-1">From <input name={`tier${i}_seats`} defaultValue={g.tiers[i]?.seats ?? ""} inputMode="numeric" className="fc-input w-16 !py-1.5" /> people:
                  <input name={`tier${i}_pct`} defaultValue={g.tiers[i]?.pct ?? ""} inputMode="decimal" className="fc-input w-16 !py-1.5" />% off</span>
              ))}
            </div>
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2">Free pilot: <input name="pilot_seats" defaultValue={g.pilot_seats} inputMode="numeric" className="fc-input w-16 !py-1.5" /> people for <input name="pilot_days" defaultValue={g.pilot_days} inputMode="numeric" className="fc-input w-16 !py-1.5" /> days</label>
              <label className="flex items-center gap-2">Proposals valid for <input name="proposal_valid_days" defaultValue={g.proposal_valid_days} inputMode="numeric" className="fc-input w-16 !py-1.5" /> days</label>
              <label className="flex items-center gap-2">Flag an organisation when <input name="domain_threshold" defaultValue={g.domain_threshold} inputMode="numeric" className="fc-input w-16 !py-1.5" /> people with its email sign up</label>
            </div>
          </fieldset>
          <p className="text-xs text-muted">The wording of the thank-you, proposal and follow-up emails is in <Link href="/admin/emails?tab=institutions" className="underline">Emails &amp; updates → Institution emails</Link>.</p>
          <button className="fc-btn fc-btn-dark justify-self-start !min-w-0 !px-5 !py-2">Save</button>
        </form>
      </Card>

      <Card title="LinkedIn ads tracking">
        <form action={saveTracking} className="grid gap-4 text-sm">
          <p className="text-muted">
            Adds the LinkedIn Insight Tag so LinkedIn can measure your ads and build retargeting audiences. Visitors see a cookie notice and the
            tag loads only if they accept. Find the IDs in LinkedIn Campaign Manager → Analyze → Insight Tag, and → Conversion tracking.
          </p>
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="grid gap-1">Insight Tag partner ID<input name="linkedin_partner_id" defaultValue={t.linkedin_partner_id ?? ""} inputMode="numeric" placeholder="e.g. 1234567" className="fc-input" /></label>
            <label className="grid gap-1">Sign-up conversion ID<input name="linkedin_signup_conversion_id" defaultValue={t.linkedin_signup_conversion_id ?? ""} inputMode="numeric" placeholder="optional" className="fc-input" /></label>
            <label className="grid gap-1">Purchase conversion ID<input name="linkedin_purchase_conversion_id" defaultValue={t.linkedin_purchase_conversion_id ?? ""} inputMode="numeric" placeholder="optional" className="fc-input" /></label>
          </div>
          <p className="text-xs text-muted">Status: {t.linkedin_partner_id ? <span className="text-success">on</span> : "off (leave the partner ID empty to switch it off)"}</p>
          <button className="fc-btn fc-btn-dark justify-self-start !min-w-0 !px-5 !py-2">Save tracking</button>
        </form>
      </Card>

    </div>
  );
}
