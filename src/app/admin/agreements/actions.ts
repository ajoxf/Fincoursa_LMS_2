"use server";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { TIME_ZONE } from "@/lib/format";

export type AgreementInput = {
  id?: string;
  party: "instructor" | "affiliate";
  partyId: string;
  title: string;
  status: "awaiting" | "signed";
  file?: { path: string; name: string } | null;   // newly uploaded file (null = keep the current one)
  sent_at?: string | null;
  signed_at?: string | null;
  valid_until?: string | null;
  notes?: string | null;
};

const day = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
const pagesFor = (party: string, partyId: string) => {
  revalidatePath(party === "instructor" ? `/admin/instructors/${partyId}` : "/admin/affiliates");
  revalidatePath(party === "instructor" ? "/admin/instructors" : "/affiliate");
  revalidatePath("/instructor");
};

/** Add or update an agreement record. Only admins; uploaded files must sit in this party's folder. */
export async function saveAgreement(input: AgreementInput): Promise<{ ok: boolean; error?: string }> {
  const admin = await requireRole(["admin"]);
  const db = createAdminClient();
  if (!["instructor", "affiliate"].includes(input.party) || !input.partyId) return { ok: false, error: "Unknown person" };
  const title = String(input.title ?? "").trim().slice(0, 150);
  if (!title) return { ok: false, error: "Give the agreement a name" };
  const status = input.status === "signed" ? "signed" : "awaiting";
  if (input.file && !input.file.path.startsWith(`${input.party}-${input.partyId}/`)) return { ok: false, error: "Upload the file again" };

  const row: Record<string, unknown> = {
    title, status,
    sent_at: day(input.sent_at), signed_at: status === "signed" ? (day(input.signed_at) ?? new Date().toLocaleDateString("en-CA", { timeZone: TIME_ZONE })) : null,
    valid_until: day(input.valid_until), notes: String(input.notes ?? "").trim().slice(0, 2000) || null,
    updated_at: new Date().toISOString(),
  };
  if (input.file) { row.file_path = input.file.path; row.file_name = String(input.file.name).slice(0, 200); }

  if (input.id) {
    const { data: cur } = await db.from("agreements").select("file_path, instructor_id, affiliate_id").eq("id", input.id).maybeSingle();
    if (!cur || (cur.instructor_id ?? cur.affiliate_id) !== input.partyId) return { ok: false, error: "Agreement not found" };
    if (status === "signed" && !input.file && !cur.file_path) return { ok: false, error: "Upload the signed copy first" };
    const { error } = await db.from("agreements").update(row).eq("id", input.id);
    if (error) return { ok: false, error: error.message };
    if (input.file && cur.file_path && cur.file_path !== input.file.path) await db.storage.from("agreements").remove([cur.file_path]);
  } else {
    if (status === "signed" && !input.file) return { ok: false, error: "Upload the signed copy first" };
    const { error } = await db.from("agreements").insert({
      ...row, party_type: input.party, created_by: admin.id,
      instructor_id: input.party === "instructor" ? input.partyId : null,
      affiliate_id: input.party === "affiliate" ? input.partyId : null,
    });
    if (error) return { ok: false, error: error.message };
  }
  await db.from("audit_log").insert({ actor_id: admin.id, action: `agreement.${input.id ? "updated" : "added"}`, entity: input.party, entity_id: input.partyId, data: { title, status } });
  pagesFor(input.party, input.partyId);
  return { ok: true };
}

export async function deleteAgreement(id: string) {
  const admin = await requireRole(["admin"]);
  const db = createAdminClient();
  const { data: a } = await db.from("agreements").select("file_path, party_type, instructor_id, affiliate_id, title").eq("id", id).maybeSingle();
  if (!a) return;
  await db.from("agreements").delete().eq("id", id);
  if (a.file_path) await db.storage.from("agreements").remove([a.file_path]);
  const partyId = (a.instructor_id ?? a.affiliate_id)!;
  await db.from("audit_log").insert({ actor_id: admin.id, action: "agreement.deleted", entity: a.party_type, entity_id: partyId, data: { title: a.title } });
  pagesFor(a.party_type, partyId);
}
