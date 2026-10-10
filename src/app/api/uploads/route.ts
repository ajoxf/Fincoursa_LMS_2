import { NextResponse } from "next/server";
import { getSessionUser, hasRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const BUCKETS = {
  "course-images": { maxMb: 10, types: /^image\/(png|jpe?g|webp|gif|svg\+xml)$/ },
  "course-files": { maxMb: 500, types: /.*/ },
} as const;

/**
 * Issues a signed upload URL (valid ~2h) so the browser uploads straight to Supabase Storage.
 * Admins may upload anywhere; instructors only course files/images for their own courses.
 */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { bucket, filename, contentType, size, courseId } = (await request.json().catch(() => ({}))) as {
    bucket?: keyof typeof BUCKETS; filename?: string; contentType?: string; size?: number; courseId?: string;
  };
  const rule = bucket && BUCKETS[bucket];
  if (!rule || !filename) return NextResponse.json({ error: "bad request" }, { status: 400 });
  if (size && size > rule.maxMb * 1024 * 1024) return NextResponse.json({ error: `File is larger than ${rule.maxMb} MB` }, { status: 413 });
  if (contentType && !rule.types.test(contentType)) return NextResponse.json({ error: "File type not allowed" }, { status: 415 });

  const db = createAdminClient();
  if (!hasRole(user, "admin")) {
    if (!hasRole(user, "instructor") || !courseId) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    const { data: own } = await db.from("course_instructors").select("course_id, instructor:instructors!inner(user_id)")
      .eq("course_id", courseId).eq("instructor.user_id", user.id).maybeSingle();
    if (!own) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const safe = filename.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(-80) || "file";
  const path = `${courseId ?? "site"}/${Date.now()}-${safe}`;
  const { data, error } = await db.storage.from(bucket).createSignedUploadUrl(path);
  if (error || !data) return NextResponse.json({ error: error?.message ?? "could not sign upload" }, { status: 500 });

  const publicUrl = bucket === "course-images" ? db.storage.from(bucket).getPublicUrl(path).data.publicUrl : null;
  return NextResponse.json({ path, token: data.token, publicUrl });
}
