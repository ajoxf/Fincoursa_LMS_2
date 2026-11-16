import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Ready-made email designs, stored in the email_designs table. A design is full email HTML with placeholders:
 * {{tag}} (click tag for links: ?v={{tag}}), {{unsubscribe_url}}, {{note}} (the personal note as table rows, placed
 * inside the main table), {{note_text}} (the note in the plain-text version) and {{first_name}}.
 * Only approved designs can be chosen and sent; drafts can be previewed by admins.
 */
export type EmailDesign = {
  id: string; name: string; description: string | null; default_subject: string | null;
  html: string; text_body: string; status: "draft" | "approved" | "retired"; sort: number;
  approved_at: string | null; created_at: string;
};

export async function listDesigns(opts: { approvedOnly?: boolean } = {}): Promise<EmailDesign[]> {
  let q = createAdminClient().from("email_designs").select("*").order("sort").order("created_at");
  if (opts.approvedOnly) q = q.eq("status", "approved");
  const { data } = await q;
  return (data ?? []) as EmailDesign[];
}

export async function getDesign(id: string | null | undefined): Promise<EmailDesign | null> {
  if (!id || id === "message") return null;
  const { data } = await createAdminClient().from("email_designs").select("*").eq("id", id).maybeSingle();
  return (data as EmailDesign) ?? null;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const FONT = "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Helvetica,Arial,sans-serif";

function noteRows(note: string) {
  if (!note) return "";
  const paras = note.split(/\n\s*\n/).map((p) => `<p style="margin:0 0 12px 0;${FONT};font-size:16px;line-height:25px;color:#e5e5e5">${esc(p).replace(/\n/g, "<br>")}</p>`).join("");
  return `<tr><td class="px" style="padding-left:36px;padding-right:36px;padding-top:18px">${paras}</td></tr>\n`;
}

/** One person's copy of a design. */
export function renderDesign(d: Pick<EmailDesign, "html" | "text_body">, o: { tag: string; unsubscribeUrl: string; note?: string | null; firstName?: string | null }) {
  const first = (o.firstName ?? "").trim().split(/\s+/)[0] || "there";
  const note = (o.note ?? "").replaceAll("{first_name}", first).trim();
  const tag = encodeURIComponent(o.tag);
  const fill = (s: string, noteValue: string, unsub: string, name: string) => s
    .replaceAll("{{note}}", noteValue).replaceAll("{{note_text}}", noteValue)
    .replaceAll("{{tag}}", tag).replaceAll("{{unsubscribe_url}}", unsub).replaceAll("{{first_name}}", name);
  const html = fill(d.html, noteRows(note), esc(o.unsubscribeUrl), esc(first));
  const text = fill(d.text_body, note, o.unsubscribeUrl, first).replace(/\n{3,}/g, "\n\n").trim();
  return { html, text };
}
