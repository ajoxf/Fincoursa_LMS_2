"use server";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSetting, setSetting } from "@/lib/site-settings";
import { EMPTY_LEGAL, LEGAL, type LegalDoc, type LegalKind } from "@/lib/legal";

const KINDS: LegalKind[] = ["terms", "privacy"];
const MAX = 200_000;

async function load(kind: LegalKind): Promise<LegalDoc> {
  return { ...EMPTY_LEGAL, ...((await getSetting<LegalDoc>(LEGAL[kind].key)) ?? {}) };
}
function refresh(kind: LegalKind) {
  revalidatePath(LEGAL[kind].path);
  revalidatePath("/admin/legal");
}

/** Publish new text. The previous version is kept in the history (last 20). */
export async function saveLegal(kind: LegalKind, body: string): Promise<{ ok: boolean; error?: string; updated_at?: string }> {
  const admin = await requireRole(["admin"]);
  if (!KINDS.includes(kind)) return { ok: false, error: "Unknown page" };
  const text = String(body ?? "").replace(/\r/g, "").trim();
  if (text.length > MAX) return { ok: false, error: "That text is too long (over 200,000 characters)." };
  const cur = await load(kind);
  if (text === cur.body.trim()) return { ok: true, updated_at: cur.updated_at ?? undefined };
  const history = cur.body.trim() && cur.updated_at ? [{ body: cur.body, updated_at: cur.updated_at, by: cur.by ?? null }, ...(cur.history ?? [])].slice(0, 20) : (cur.history ?? []);
  const updated_at = new Date().toISOString();
  await setSetting(LEGAL[kind].key, { ...cur, body: text, updated_at, by: admin.fullName || admin.email, history }, admin.id);
  await createAdminClient().from("audit_log").insert({ actor_id: admin.id, action: `legal.${kind}.updated`, entity: "site_settings", entity_id: LEGAL[kind].key, data: { chars: text.length } });
  refresh(kind);
  return { ok: true, updated_at };
}

/** Attach (or remove, with null) the downloadable PDF version. */
export async function setLegalPdf(kind: LegalKind, file: { url: string; name: string } | null) {
  const admin = await requireRole(["admin"]);
  if (!KINDS.includes(kind)) throw new Error("Unknown page");
  if (file && !/^https?:\/\//.test(file.url)) throw new Error("Invalid file");
  const cur = await load(kind);
  await setSetting(LEGAL[kind].key, { ...cur, pdf_url: file?.url ?? null, pdf_name: file?.name?.slice(0, 200) ?? null }, admin.id);
  refresh(kind);
}

/** Read a Word (.docx), Markdown or plain-text file into editable text. Nothing is published until Save. */
export async function importLegalFile(form: FormData): Promise<{ ok: boolean; text?: string; error?: string }> {
  await requireRole(["admin"]);
  const file = form.get("file");
  if (!(file instanceof File) || !file.size) return { ok: false, error: "Choose a file" };
  if (file.size > 10 * 1024 * 1024) return { ok: false, error: "That file is over 10 MB." };
  const name = file.name.toLowerCase();
  try {
    if (name.endsWith(".docx")) {
      const mammoth = await import("mammoth");
      const { value } = await mammoth.convertToHtml({ buffer: Buffer.from(await file.arrayBuffer()) });
      return { ok: true, text: htmlToText(value) };
    }
    if (name.endsWith(".txt") || name.endsWith(".md")) return { ok: true, text: (await file.text()).replace(/\r/g, "").trim() };
    if (name.endsWith(".doc")) return { ok: false, error: "Old .doc files can't be read. In Word, use File → Save As → Word Document (.docx), then import that." };
    if (name.endsWith(".pdf")) return { ok: false, error: "A PDF can't be turned into editable text reliably. Attach it as the downloadable PDF instead, or import the Word version." };
    return { ok: false, error: "Use a Word (.docx), .txt or .md file." };
  } catch {
    return { ok: false, error: "Couldn't read that file. Try saving it again as .docx." };
  }
}

/** Word's HTML (from mammoth) → the simple format the site renders: headings, paragraphs, lists, bold, links. */
function htmlToText(html: string) {
  const decode = (t: string) => t.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
  const inline = (t: string) => decode(t
    .replace(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g, (_, href, label) => (/^(https?:|mailto:)/.test(href) ? `[${label.replace(/<[^>]+>/g, "")}](${href})` : label))
    .replace(/<(strong|b)>([\s\S]*?)<\/\1>/g, "**$2**")
    .replace(/<(em|i)>([\s\S]*?)<\/\1>/g, "*$2*")
    .replace(/<br\s*\/?>/g, " ")
    .replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").replace(/\*\*\s*\*\*/g, "").trim();
  const out: string[] = [];
  const blocks = html.match(/<(h[1-6]|p|ul|ol|table)[^>]*>[\s\S]*?<\/\1>/g) ?? [];
  for (const b of blocks) {
    const tag = /^<(\w+)/.exec(b)![1];
    if (/^h[1-6]$/.test(tag)) { const t = inline(b); if (t) out.push(`${Number(tag[1]) <= 2 ? "##" : "###"} ${t.replace(/^\*\*(.*)\*\*$/, "$1")}`); }
    else if (tag === "p") { const t = inline(b); if (t) out.push(t); }
    else if (tag === "ul" || tag === "ol") {
      const items = (b.match(/<li[^>]*>[\s\S]*?<\/li>/g) ?? []).map((li, i) => `${tag === "ol" ? `${i + 1}.` : "-"} ${inline(li)}`);
      if (items.length) out.push(items.join("\n"));
    } else if (tag === "table") {
      const rows = (b.match(/<tr[^>]*>[\s\S]*?<\/tr>/g) ?? []).map((r) => (r.match(/<t[dh][^>]*>[\s\S]*?<\/t[dh]>/g) ?? []).map(inline).filter(Boolean).join(" · "));
      if (rows.length) out.push(rows.map((r) => `- ${r}`).join("\n"));
    }
  }
  return out.join("\n\n").trim();
}
