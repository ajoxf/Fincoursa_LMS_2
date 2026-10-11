import { NextResponse } from "next/server";
import { getSessionUser, hasRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/** Opens an agreement file through a 2-minute signed link. Staff (admin, finance), or the person it's with. */
export async function GET(_req: Request, ctx: RouteContext<"/api/agreements/[id]">) {
  const { id } = await ctx.params;
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const db = createAdminClient();
  const { data: a } = await db.from("agreements")
    .select("file_path, file_name, instructor:instructors(user_id), affiliate:affiliates(user_id)").eq("id", id).maybeSingle();
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  const owner = ((a?.instructor as any)?.user_id ?? (a?.affiliate as any)?.user_id) as string | undefined;
  const allowed = hasRole(user, "admin") || hasRole(user, "finance") || (owner && owner === user.id);
  if (!a?.file_path || !allowed) return NextResponse.json({ error: "not found" }, { status: 404 });
  const { data, error } = await db.storage.from("agreements").createSignedUrl(a.file_path, 120, { download: a.file_name ?? true });
  if (error || !data) return NextResponse.json({ error: "could not open the file" }, { status: 500 });
  return NextResponse.redirect(data.signedUrl, { headers: { "Cache-Control": "no-store" } });
}
