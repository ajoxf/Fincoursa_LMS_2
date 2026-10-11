import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export type Party = { type: "instructor"; id: string } | { type: "affiliate"; id: string };

export type Agreement = {
  id: string; title: string; status: "awaiting" | "signed"; file_name: string | null; has_file: boolean;
  sent_at: string | null; signed_at: string | null; valid_until: string | null; notes: string | null; created_at: string;
};

const COLS = "id, title, status, file_path, file_name, sent_at, signed_at, valid_until, notes, created_at";
/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
const shape = (r: any): Agreement => ({ ...r, has_file: Boolean(r.file_path), file_path: undefined });

export async function agreementsFor(party: Party): Promise<Agreement[]> {
  const q = createAdminClient().from("agreements").select(COLS).order("created_at", { ascending: false });
  const { data } = await (party.type === "instructor" ? q.eq("instructor_id", party.id) : q.eq("affiliate_id", party.id));
  return (data ?? []).map(shape);
}

/** Signed / awaiting per person, for the list pages. */
export async function agreementStatus(type: Party["type"]): Promise<Map<string, "signed" | "awaiting">> {
  const col = type === "instructor" ? "instructor_id" : "affiliate_id";
  const { data } = await createAdminClient().from("agreements").select(`${col}, status`).eq("party_type", type);
  const out = new Map<string, "signed" | "awaiting">();
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  for (const r of (data ?? []) as any[]) {
    const id = r[col] as string;
    if (r.status === "signed" || !out.has(id)) out.set(id, r.status);
  }
  return out;
}

/** The person's own agreements (shown in their instructor / partner dashboard). */
export async function myAgreements(userId: string): Promise<Agreement[]> {
  const db = createAdminClient();
  const [{ data: ins }, { data: aff }] = await Promise.all([
    db.from("instructors").select("id").eq("user_id", userId),
    db.from("affiliates").select("id").eq("user_id", userId),
  ]);
  const ors = [
    ...(ins ?? []).map((i) => `instructor_id.eq.${i.id}`),
    ...(aff ?? []).map((a) => `affiliate_id.eq.${a.id}`),
  ];
  if (!ors.length) return [];
  const { data } = await db.from("agreements").select(COLS).or(ors.join(",")).order("created_at", { ascending: false });
  return (data ?? []).map(shape);
}

/** Every agreement of one kind, grouped by person (for list pages). */
export async function agreementsByParty(type: Party["type"]): Promise<Map<string, Agreement[]>> {
  const col = type === "instructor" ? "instructor_id" : "affiliate_id";
  const { data } = await createAdminClient().from("agreements").select(`${COLS}, ${col}`).eq("party_type", type).order("created_at", { ascending: false });
  const out = new Map<string, Agreement[]>();
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  for (const r of (data ?? []) as any[]) {
    const id = r[col] as string;
    out.set(id, [...(out.get(id) ?? []), shape({ ...r, [col]: undefined })]);
  }
  return out;
}
