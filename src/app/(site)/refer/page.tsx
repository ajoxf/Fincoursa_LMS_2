import type { Metadata } from "next";
import Link from "next/link";
import { getSessionUser } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/format";
import { getCashbackSettings } from "@/lib/cashback";
import { ensureReferralCode, getReferralSettings, referralStats, referralUrl } from "@/lib/referral";
import { ShareLink } from "./ShareLink";

export const metadata: Metadata = { title: "Refer a friend", description: "Share FinCoursa with a friend preparing for the CMT exam and earn FinCoursa credit when they buy." };

export default async function ReferPage() {
  const [user, s, cb] = await Promise.all([getSessionUser(), getReferralSettings(), getCashbackSettings()]);
  const until = cb.redeem_by ? `until ${formatDate(cb.redeem_by)}` : cb.validity_days ? `for ${cb.validity_days} days` : "";
  const code = user && s.enabled ? await ensureReferralCode(user.id, user.fullName, user.email) : null;
  const stats = user && s.enabled ? await referralStats(user.id) : null;
  const message = "I'm using the FinCoursa CMT Level II Question Bank: 1,100+ exam-style questions with every answer explained. Try the free sample:";

  return (
    <div className="fc-container grid max-w-3xl gap-8 py-14">
      <div>
        <p className="text-sm font-semibold uppercase tracking-widest text-primary">Refer a friend</p>
        <h1 className="mt-2 text-4xl font-bold text-ink">Know someone who may benefit?</h1>
        <p className="mt-3 text-lg text-muted">
          Share FinCoursa with a friend preparing for the CMT exam. When they buy, you get <b className="text-ink">{s.percent}% of what they paid</b> as
          FinCoursa credit{until ? `, usable ${until}` : ""}.
        </p>
      </div>
      {!s.enabled ? (
        <p className="rounded-lg bg-surface p-4 text-sm text-muted">Referral rewards are paused at the moment. You can still share fincoursa.com with friends.</p>
      ) : code ? (
        <div className="grid gap-6">
          <ShareLink url={referralUrl(code)} message={message} />
          <div className="grid grid-cols-2 gap-4">
            <div className="fc-card p-5"><p className="text-sm text-muted">Friends who bought</p><p className="mt-1 text-3xl font-bold text-ink">{stats?.friends ?? 0}</p></div>
            <div className="fc-card p-5"><p className="text-sm text-muted">Credit you earned</p><p className="mt-1 text-3xl font-bold text-ink">
              {Object.entries(stats?.earned ?? {}).map(([c, v]) => formatMoney(v, c)).join(" · ") || formatMoney(0)}</p></div>
          </div>
          <p className="text-sm text-muted">Your credit is applied automatically at your next checkout. See it under <Link href="/dashboard/purchases" className="underline">Purchases</Link>.</p>
        </div>
      ) : (
        <div className="fc-card grid gap-4 p-6">
          <p className="text-ink">Create a free FinCoursa account to get your personal link. It takes a minute and you can try the free sample questions too.</p>
          <div className="flex flex-wrap gap-3">
            <Link href="/users/sign_up?next=/refer" className="fc-btn fc-btn-primary">Get my link</Link>
            <Link href="/users/sign_in?next=/refer" className="fc-btn fc-btn-outline text-ink">I have an account</Link>
          </div>
        </div>
      )}
      <div className="grid gap-2 text-sm text-muted">
        <h2 className="text-base font-semibold text-ink">How it works</h2>
        <ol className="list-decimal space-y-1 pl-5">
          <li>Share your link by WhatsApp, LinkedIn, email or anywhere you like.</li>
          <li>Your friend opens it and buys within 30 days.</li>
          <li>Once their payment goes through, {s.percent}% of what they paid (before tax) is added to your account as credit.</li>
        </ol>
        <p className="text-xs">Credit, not cash: it can be used on FinCoursa purchases{until ? ` ${until}` : ""} and can&apos;t be withdrawn or transferred. If your friend&apos;s order is refunded, the credit is cancelled. Buying through your own link doesn&apos;t count. See the <Link href="/pages/terms-conditions" className="underline">terms</Link>.</p>
      </div>
    </div>
  );
}
