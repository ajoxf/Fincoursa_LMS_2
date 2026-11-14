import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getGrowthSettings, quote } from "@/lib/growth";
import { formatDate } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { Respond } from "./Respond";

export const metadata: Metadata = { title: "Proposal", robots: { index: false, follow: false } };

/** A lead's proposal: courses, a quote for their team and a free pilot. Reached only through its unguessable link. */
export default async function ProposalPage({ params }: PageProps<"/proposals/[token]">) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{20,40}$/.test(token)) notFound();
  const db = createAdminClient();
  const { data: lead } = await db.from("institution_leads")
    .select("id, organization, contact_name, country, seats, course_ids, currency, seat_price_minor, discount_pct, value_minor, proposal_sent_at, created_at")
    .eq("proposal_token", token).maybeSingle();
  if (!lead) notFound();
  const s = await getGrowthSettings();
  const { data: courses } = lead.course_ids?.length
    ? await db.from("courses").select("id, title, subtitle, coming_soon").in("id", lead.course_ids)
    : { data: [] as { id: string; title: string; subtitle: string | null; coming_soon: boolean }[] };
  const seats = lead.seats ?? 10;
  const n = Math.max(1, courses?.length ?? 0);
  const q = quote(s, seats, n, lead.country);
  const currency = lead.currency ?? q.currency;
  const per = Number(lead.seat_price_minor ?? q.seat_price_minor);
  const pct = Number(lead.discount_pct ?? q.discount_pct);
  const gross = per * seats * n;
  const total = Number(lead.value_minor ?? Math.round(gross * (1 - pct / 100)));
  const issued = lead.proposal_sent_at ?? lead.created_at;
  const validUntil = new Date(new Date(issued).getTime() + s.proposal_valid_days * 86400_000).toISOString();
  const m = (v: number) => formatMoney(v, currency);

  return (
    <section className="bg-surface">
      <div className="fc-container grid max-w-[880px] gap-8 py-14">
        <div className="rounded-3xl bg-black p-8 text-white md:p-10">
          <p className="text-sm uppercase tracking-[0.14em] text-white/70">Proposal</p>
          <h1 className="fc-display mt-3 text-4xl md:text-5xl">FinCoursa for {lead.organization}</h1>
          <p className="mt-4 text-white/80">Prepared {formatDate(issued, "long")}{lead.contact_name ? ` for ${lead.contact_name}` : ""} · valid until {formatDate(validUntil, "long")}</p>
        </div>

        <div className="grid gap-4 rounded-3xl bg-white p-8">
          <h2 className="text-2xl font-semibold text-ink">What&apos;s included</h2>
          {courses?.length ? (
            <ul className="grid gap-3">
              {courses.map((c) => (
                <li key={c.id} className="border-t border-line pt-3 first:border-0 first:pt-0">
                  <p className="font-semibold text-ink">{c.title}{c.coming_soon && <span className="ml-2 text-xs font-normal text-muted">(launching soon: access from launch)</span>}</p>
                  {c.subtitle && <p className="text-[15px] text-ink/80">{c.subtitle}</p>}
                </li>
              ))}
            </ul>
          ) : <p className="text-[15px] text-ink/85">Courses to be agreed with you from the FinCoursa catalogue.</p>}
          <ul className="mt-2 grid list-disc gap-1 pl-5 text-[15px] text-ink/85">
            <li>Self-paced access for each person, on any device</li>
            <li>A certificate for everyone who completes a course</li>
            <li>Invoices with the right tax details for your finance team</li>
            <li>Optional live sessions with the instructor, quoted separately</li>
          </ul>
        </div>

        <div className="grid gap-4 rounded-3xl bg-white p-8">
          <h2 className="text-2xl font-semibold text-ink">Pricing</h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-left text-[15px] text-ink">
              <tbody className="divide-y divide-line">
                <tr><td className="py-2">People</td><td className="py-2 text-right tabular-nums">{seats}</td></tr>
                <tr><td className="py-2">Courses</td><td className="py-2 text-right tabular-nums">{n}</td></tr>
                <tr><td className="py-2">Price per person, per course</td><td className="py-2 text-right tabular-nums">{m(per)}</td></tr>
                <tr><td className="py-2">Subtotal</td><td className="py-2 text-right tabular-nums">{m(gross)}</td></tr>
                {pct > 0 && <tr><td className="py-2">Team discount ({pct}%)</td><td className="py-2 text-right tabular-nums">−{m(gross - total)}</td></tr>}
                <tr className="font-semibold"><td className="py-3">Total</td><td className="py-3 text-right text-xl tabular-nums">{m(total)}</td></tr>
              </tbody>
            </table>
          </div>
          <p className="text-sm text-muted">Plus applicable taxes, shown on the invoice. Prices are for 12 months of access unless agreed otherwise.</p>
        </div>

        <div className="grid gap-4 rounded-3xl bg-white p-8">
          <h2 className="text-2xl font-semibold text-ink">Next step</h2>
          <Respond token={token} pilotSeats={s.pilot_seats} pilotDays={s.pilot_days} />
          <p className="text-sm text-muted">Questions? Email {s.team_email}{s.booking_url ? <> or <a href={s.booking_url} className="underline" target="_blank" rel="noreferrer">book a short call</a></> : null}.</p>
        </div>
        <p className="text-xs text-muted">FinCoursa is operated by PRJ International. All FinCoursa content is for educational purposes only and is not financial advice.</p>
      </div>
    </section>
  );
}
