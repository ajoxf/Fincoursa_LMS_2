import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/send";
import { messageEmail } from "@/lib/email/templates";
import { env } from "@/lib/env";

/**
 * Admin alerts for orders that need a person: a buyer paid (or used a 100% code) but the enrolment didn't go through.
 * Each problem is logged (audit_log "alert.order"), emailed at once to every admin (plus ADMIN_ALERT_EMAIL if set),
 * and listed at the top of the admin pages until the order is enrolled.
 */
export async function alertOrderProblem(orderId: string, problem: string) {
  const db = createAdminClient();
  const { data: o } = await db.from("orders").select("id, number, total_minor, currency, gateway, created_at, user_id, order_items(title)").eq("id", orderId).maybeSingle();
  const { data: buyer } = o ? await db.from("profiles").select("email, full_name").eq("id", o.user_id).maybeSingle() : { data: null };
  const item = (o?.order_items ?? []).map((i: { title: string }) => i.title).join(", ") || "an order";
  await db.from("audit_log").insert({ action: "alert.order", entity: "orders", entity_id: orderId, data: { problem, number: o?.number ?? null } });

  const { data: roles } = await db.from("user_roles").select("user_id").eq("role", "admin");
  const ids = (roles ?? []).map((r) => r.user_id);
  const { data: admins } = ids.length ? await db.from("profiles").select("email").in("id", ids) : { data: [] as { email: string | null }[] };
  const to = [...new Set([...(admins ?? []).map((a) => a.email), process.env.ADMIN_ALERT_EMAIL].filter((e): e is string => Boolean(e)).map((e) => e.toLowerCase()))];
  const t = messageEmail({
    subject: `Action needed: order #${o?.number ?? "?"} didn't enrol the buyer`,
    heading: `Order #${o?.number ?? "?"} needs attention`,
    body: [
      `${buyer?.full_name || buyer?.email || "A buyer"} (${buyer?.email ?? "no email"}) placed an order for ${item}, but they were not enrolled.`,
      `What went wrong: ${problem}`,
      "Open the admin pages: the order is listed at the top with a button to complete the enrolment. The buyer may already be waiting.",
    ].join("\n\n"),
    cta: { label: "Open admin", url: `${env.siteUrl}/admin` },
    footer: "Automatic alert from fincoursa.com.",
  });
  for (const email of to) {
    await sendEmail({ ...t, to: email, template: "admin_alert", ref: `${orderId}:${email}` }).catch((e) => console.error("[alert] email", e));
  }
}

export type OrderAlert = { id: string; number: number; created_at: string; total_minor: number; currency: string; gateway: string | null; email: string | null; item: string; problem: string };

/** Orders that should have enrolled someone and haven't: alerted ones still unpaid, plus free orders stuck for over 2 minutes. */
export async function openOrderAlerts(): Promise<OrderAlert[]> {
  const db = createAdminClient();
  const since = new Date(Date.now() - 30 * 864e5).toISOString();
  const [{ data: logged }, { data: stuckFree }] = await Promise.all([
    db.from("audit_log").select("entity_id, data, created_at").eq("action", "alert.order").gte("created_at", since).order("created_at", { ascending: false }),
    db.from("orders").select("id").eq("status", "pending").eq("gateway", "free").lt("created_at", new Date(Date.now() - 120e3).toISOString()).gte("created_at", since),
  ]);
  const problems = new Map<string, string>();
  for (const l of logged ?? []) if (l.entity_id && !problems.has(l.entity_id)) problems.set(l.entity_id, String((l.data as { problem?: string })?.problem ?? "Enrolment failed"));
  for (const s of stuckFree ?? []) if (!problems.has(s.id)) problems.set(s.id, "A free order (100% code) is still waiting: the enrolment didn't complete.");
  if (!problems.size) return [];
  const { data: orders } = await db.from("orders").select("id, number, created_at, total_minor, currency, gateway, status, user_id, order_items(title)")
    .in("id", [...problems.keys()]).in("status", ["pending", "failed"]);
  if (!orders?.length) return [];
  const { data: people } = await db.from("profiles").select("id, email").in("id", orders.map((o) => o.user_id));
  const email = new Map((people ?? []).map((p) => [p.id, p.email as string | null]));
  return orders.map((o) => ({
    id: o.id, number: o.number, created_at: o.created_at, total_minor: o.total_minor, currency: o.currency, gateway: o.gateway,
    email: email.get(o.user_id) ?? null, item: (o.order_items ?? []).map((i: { title: string }) => i.title).join(", "), problem: problems.get(o.id)!,
  }));
}
