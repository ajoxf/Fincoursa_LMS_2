import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCashbackSettings } from "@/lib/cashback";
import { reviewOffers } from "@/lib/reviews";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/format";
import { submitReview } from "./actions";

export const metadata: Metadata = { title: "Share feedback and a review", robots: { index: false } };

export default async function ReviewPage({ params, searchParams }: { params: Promise<{ order: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { order } = await params;
  const sp = await searchParams;
  const user = await requireUser(`/review/${order}`);
  const s = await getCashbackSettings();
  const offer = (await reviewOffers(user.id, s)).find((o) => o.orderId === order);
  const { data: existing } = await createAdminClient().from("course_reviews")
    .select("status, course:courses(title)").eq("order_id", order).eq("user_id", user.id).maybeSingle();
  const useBy = s.redeem_by ? formatDate(s.redeem_by, "long") : null;

  if (existing || sp.sent) {
    const status = existing?.status ?? "pending";
    return (
      <section className="fc-container max-w-xl py-20">
        <h1 className="text-3xl font-bold text-primary">Thank you</h1>
        <p className="mt-4 text-[15px] leading-relaxed text-ink/80">
          {status === "approved"
            ? "We've read your feedback and added the extra credit to your account."
            : status === "rejected"
              ? "We've read your feedback. This review didn't qualify for the extra cashback; reply to our email if you'd like to talk about it."
              : `We've received your feedback and review. Once we've read it, we'll add the extra credit to your account and email you${useBy ? `. It can be used until ${useBy}` : ""}.`}
        </p>
        <Link href="/dashboard" className="fc-btn fc-btn-primary mt-8">Back to my courses</Link>
      </section>
    );
  }

  if (!offer) {
    return (
      <section className="fc-container max-w-xl py-20">
        <h1 className="text-3xl font-bold text-primary">Share feedback and a review</h1>
        <p className="mt-4 text-[15px] text-ink/80">This order isn&apos;t eligible for the review cashback. It may not have earned cashback, the offer may have ended, or the order isn&apos;t on this account.</p>
        <Link href="/dashboard" className="fc-btn fc-btn-primary mt-8">Back to my courses</Link>
      </section>
    );
  }

  const field = "fc-input w-full";
  return (
    <section className="fc-container max-w-xl py-16">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">{offer.courseTitle} · order #{offer.orderNumber}</p>
      <h1 className="mt-2 text-3xl font-bold text-primary">Share feedback and a review</h1>
      <p className="mt-4 text-[15px] leading-relaxed text-ink/80">
        Tell us what&apos;s working and what we should improve. Once we&apos;ve read it, we&apos;ll top up your cashback to {offer.pct}% of what you paid:
        <strong> {formatMoney(offer.topUpMinor, offer.currency)} more FinCoursa credit</strong>{useBy ? `, usable until ${useBy}` : ""}.
      </p>
      {typeof sp.err === "string" && <p className="mt-6 rounded-lg bg-danger/10 p-3 text-sm text-danger">{sp.err}</p>}
      <form action={submitReview.bind(null, offer.orderId)} className="mt-8 grid gap-6">
        <fieldset>
          <legend className="text-sm font-semibold">Your rating</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {[5, 4, 3, 2, 1].map((n) => (
              <label key={n} className="cursor-pointer">
                <input type="radio" name="rating" value={n} required className="peer sr-only" />
                <span className="inline-flex items-center gap-1 rounded-full border border-line px-4 py-2 text-sm peer-checked:border-ink peer-checked:bg-accent peer-checked:font-semibold peer-focus-visible:ring-2 peer-focus-visible:ring-ink">
                  {"★".repeat(n)}<span className="sr-only"> {n} out of 5</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <label className="grid gap-1.5">
          <span className="text-sm font-semibold">Feedback for us <span className="font-normal text-muted">(private)</span></span>
          <textarea name="feedback" required minLength={20} maxLength={4000} rows={5} className={field}
            placeholder="What helped you most? What was missing, unclear or wrong? Anything you'd change?" />
        </label>
        <label className="grid gap-1.5">
          <span className="text-sm font-semibold">Your review</span>
          <textarea name="review" required minLength={20} maxLength={1500} rows={4} className={field}
            placeholder="A few sentences another CMT candidate would find useful." />
        </label>
        <button className="fc-btn fc-btn-primary justify-self-start">Send feedback and review</button>
        {/* consent stays ticked by default, shown quietly under the button */}
        <label className="-mt-3 flex items-center gap-2 text-xs text-muted">
          <input type="checkbox" name="can_publish" defaultChecked className="h-3.5 w-3.5 accent-black" />
          <span>Your review may appear on fincoursa.com with your first name.</span>
        </label>
        <p className="text-xs text-muted">Credit is not cash. It can be used on future FinCoursa courses and can&apos;t be withdrawn, refunded or transferred. One review per order.</p>
      </form>
    </section>
  );
}
