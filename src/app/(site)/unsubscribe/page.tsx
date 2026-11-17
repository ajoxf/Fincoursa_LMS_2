import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyContactUnsubscribe, verifyUnsubscribe } from "@/lib/email/unsubscribe";
import { syncEmailContact } from "@/lib/email-list";

export const metadata: Metadata = { title: "Email preferences", robots: { index: false } };

async function unsubscribe(form: FormData) {
  "use server";
  const u = String(form.get("u") ?? ""), t = String(form.get("t") ?? "");
  if (!verifyUnsubscribe(u, t)) redirect("/unsubscribe?error=1");
  await createAdminClient().from("profiles").update({ marketing_opt_in: false }).eq("id", u);
  await syncEmailContact(u).catch(() => "failed");
  redirect(`/unsubscribe?u=${u}&t=${t}&done=1`);
}

async function unsubscribeContact(form: FormData) {
  "use server";
  const c = String(form.get("c") ?? ""), t = String(form.get("t") ?? "");
  if (!verifyContactUnsubscribe(c, t)) redirect("/unsubscribe?error=1");
  await createAdminClient().from("email_contacts").update({ unsubscribed_at: new Date().toISOString() }).eq("id", c).is("unsubscribed_at", null);
  redirect(`/unsubscribe?c=${c}&t=${t}&done=1`);
}

/** A button (not an automatic change) so email link scanners can't unsubscribe people by accident. */
export default async function UnsubscribePage({ searchParams }: PageProps<"/unsubscribe">) {
  const sp = await searchParams;
  const u = typeof sp.u === "string" ? sp.u : "", t = typeof sp.t === "string" ? sp.t : "";
  const c = typeof sp.c === "string" ? sp.c : "";
  if (c) {
    // imported contact (no FinCoursa account)
    const ok = verifyContactUnsubscribe(c, t);
    const { data: k } = ok ? await createAdminClient().from("email_contacts").select("email, unsubscribed_at").eq("id", c).maybeSingle() : { data: null };
    return (
      <section className="bg-surface">
        <div className="fc-container py-16 lg:py-28">
          <div className="mx-auto max-w-[560px] rounded-2xl bg-white p-8 text-center md:p-12">
            <span className="fc-pill">Email preferences</span>
            {!ok || !k ? (
              <><h1 className="fc-h2 mt-4 text-ink">This link isn&apos;t valid</h1>
                <p className="mt-4 text-[15px] text-ink/80">Reply to any FinCoursa email and we&apos;ll take you off the list.</p></>
            ) : sp.done || k.unsubscribed_at ? (
              <><h1 className="fc-h2 mt-4 text-ink">You&apos;re unsubscribed</h1>
                <p className="mt-4 text-[15px] text-ink/80">{k.email} won&apos;t receive emails from FinCoursa again.</p></>
            ) : (
              <><h1 className="fc-h2 mt-4 text-ink">Unsubscribe from FinCoursa emails?</h1>
                <p className="mt-4 text-[15px] text-ink/80">{k.email} will stop receiving emails from FinCoursa.</p>
                <form action={unsubscribeContact} className="mt-8"><input type="hidden" name="c" value={c} /><input type="hidden" name="t" value={t} />
                  <button className="fc-btn fc-btn-primary fc-btn-lg">Unsubscribe</button></form></>
            )}
          </div>
        </div>
      </section>
    );
  }
  const valid = verifyUnsubscribe(u, t);
  const { data: p } = valid ? await createAdminClient().from("profiles").select("email, marketing_opt_in").eq("id", u).maybeSingle() : { data: null };
  return (
    <section className="bg-surface">
      <div className="fc-container py-16 lg:py-28">
        <div className="mx-auto max-w-[560px] rounded-2xl bg-white p-8 text-center md:p-12">
          <span className="fc-pill">Email preferences</span>
          {!valid || !p ? (
            <><h1 className="fc-h2 mt-4 text-ink">This link isn&apos;t valid</h1>
              <p className="mt-4 text-[15px] text-ink/80">Sign in and open Settings to change your email preferences.</p></>
          ) : sp.done || !p.marketing_opt_in ? (
            <><h1 className="fc-h2 mt-4 text-ink">You&apos;re unsubscribed</h1>
              <p className="mt-4 text-[15px] text-ink/80">{p.email} won&apos;t receive updates on new courses, study tips or offers from FinCoursa. You&apos;ll still get receipts and messages about courses you&apos;re enrolled in. You can opt back in any time in Settings.</p></>
          ) : (
            <><h1 className="fc-h2 mt-4 text-ink">Stop updates from FinCoursa?</h1>
              <p className="mt-4 text-[15px] text-ink/80">{p.email} will stop receiving updates on new courses, study tips and offers. Receipts and updates about your courses still arrive.</p>
              <form action={unsubscribe} className="mt-8"><input type="hidden" name="u" value={u} /><input type="hidden" name="t" value={t} />
                <button className="fc-btn fc-btn-primary fc-btn-lg">Unsubscribe</button></form></>
          )}
        </div>
      </div>
    </section>
  );
}
