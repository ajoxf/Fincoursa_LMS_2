"use server";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/send";
import { partnerInviteEmail } from "@/lib/email/templates";
import { env } from "@/lib/env";

export type InviteState = { ok?: boolean; error?: string; message?: string } | null;

const codeFrom = (name: string) => (name.split(/\s+/)[0] ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12) || "PARTNER";

/**
 * Invite a partner: creates the account if needed and an approved partner record in one step,
 * then emails their code, commission and link (with a set-up button for new accounts).
 */
export async function inviteAffiliate(_: InviteState, form: FormData): Promise<InviteState> {
  const admin = await requireRole(["admin"]);
  const db = createAdminClient();
  const name = String(form.get("name") ?? "").trim().slice(0, 120);
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const pct = Number(form.get("commission_pct") || 20);
  let code = String(form.get("code") ?? "").trim().toUpperCase();
  const parentCode = String(form.get("parent_code") ?? "").trim().toUpperCase();
  if (!name) return { error: "Enter their name" };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Enter a valid email address" };
  if (!(pct >= 0 && pct <= 100)) return { error: "Commission must be between 0 and 100%" };
  if (code && !/^[A-Z0-9_-]{3,30}$/.test(code)) return { error: "Code: use 3–30 letters, numbers, - or _" };

  let parentId: string | null = null;
  if (parentCode) {
    const { data: parent } = await db.from("affiliates").select("id, status").eq("code", parentCode).maybeSingle();
    if (!parent || parent.status !== "approved") return { error: `No approved partner with the code ${parentCode}` };
    parentId = parent.id;
  }

  // the account: existing, or a new one they set up from the email
  let { data: profile } = await db.from("profiles").select("id, full_name").eq("email", email).maybeSingle();
  let isNew = false;
  if (!profile) {
    const { data: created, error } = await db.auth.admin.createUser({ email, email_confirm: true, user_metadata: { full_name: name } });
    if (error || !created.user) return { error: `Could not create an account for ${email}: ${error?.message ?? "unknown error"}` };
    profile = { id: created.user.id, full_name: name };
    isNew = true;
    await db.from("profiles").update({ full_name: name }).eq("id", created.user.id).is("full_name", null);
  }
  const { data: existing } = await db.from("affiliates").select("id, status, code").eq("user_id", profile.id).maybeSingle();
  if (existing?.status === "approved") return { error: `${email} is already a partner (code ${existing.code}).` };

  // a free code: theirs, or one made from their first name
  if (!code) {
    const base = codeFrom(name);
    for (let i = 0; i < 20 && !code; i++) {
      const c = i === 0 ? base : `${base}${Math.floor(10 + Math.random() * 90)}`;
      const { data: taken } = await db.from("affiliates").select("id").eq("code", c).maybeSingle();
      if (!taken || taken.id === existing?.id) code = c;
    }
  }
  const row = { code, status: "approved", commission_pct: pct, parent_affiliate_id: parentId, approved_at: new Date().toISOString(), notes: `Invited by the FinCoursa team` };
  const { data: aff, error: aErr } = existing
    ? await db.from("affiliates").update(row).eq("id", existing.id).select("id").single()
    : await db.from("affiliates").insert({ ...row, user_id: profile.id }).select("id").single();
  if (aErr || !aff) return { error: aErr?.code === "23505" ? `The code ${code} is taken. Try another.` : `Could not save the partner: ${aErr?.message}` };
  await db.from("user_roles").upsert({ user_id: profile.id, role: "affiliate" });
  await db.from("audit_log").insert({ actor_id: admin.id, action: "affiliate.invited", entity: "affiliate", entity_id: aff.id, data: { email, code, commission_pct: pct } });

  const site = env.siteUrl.replace(/\/$/, "");
  const m = partnerInviteEmail({
    name: profile.full_name || name, code, commissionPct: pct, link: `${site}/?ref=${code}`, dashboardUrl: `${site}/affiliate`,
    setupUrl: isNew ? `${site}/users/sign_in?invite=1&email=${encodeURIComponent(email)}&next=/affiliate` : null,
  });
  // already approved, so they don't also get the "you're approved" email
  const sent = await sendEmail({ to: email, ...m, template: "partner_invite", ref: aff.id });
  revalidatePath("/admin/affiliates");
  return sent
    ? { ok: true, message: `Invitation sent to ${email}. Code ${code}, ${pct}% commission.` }
    : { ok: true, message: `${name} is set up as a partner (code ${code}), but the email couldn't be sent. They can sign in with just their email on the Sign In page.` };
}
