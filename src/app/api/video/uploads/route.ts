import { NextResponse } from "next/server";
import { getSessionUser, hasRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createDirectUpload } from "@/lib/mux";
import { env } from "@/lib/env";

// Instructor/admin asks for an upload URL; the browser then uploads straight to Mux.
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user || !(hasRole(user, "instructor") || hasRole(user, "admin"))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { title, lessonId } = (await request.json().catch(() => ({}))) as { title?: string; lessonId?: string };
  const db = createAdminClient();

  if (lessonId && !hasRole(user, "admin")) {
    const { data: lesson } = await db.from("lessons").select("course_id").eq("id", lessonId).single();
    const { data: own } = await db
      .from("course_instructors").select("instructor:instructors!inner(user_id)")
      .eq("course_id", lesson?.course_id ?? "").eq("instructor.user_id", user.id).maybeSingle();
    if (!own) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { data: asset, error } = await db.from("video_assets")
    .insert({ title: title ?? null, created_by: user.id, status: "waiting_upload" }).select("id").single();
  if (error || !asset) return NextResponse.json({ error: "could not create asset" }, { status: 500 });

  const upload = await createDirectUpload(asset.id, request.headers.get("origin") ?? env.siteUrl);
  await db.from("video_assets").update({ upload_id: upload.id }).eq("id", asset.id);
  if (lessonId) await db.from("lessons").update({ video_asset_id: asset.id }).eq("id", lessonId);

  return NextResponse.json({ uploadUrl: upload.url, videoAssetId: asset.id });
}
