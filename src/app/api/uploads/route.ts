import { NextResponse } from "next/server";
import { getSessionUser, hasRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { allow, LIMITS } from "@/lib/rate-limit";

const BUCKETS = {
  "course-images": { maxMb: 10, types: /^image\/(png|jpe?g|webp|gif|svg\+xml)$/ },
  "course-files": { maxMb: 500, types: /.*/ },
  // signed agreements with instructors and partners (PDF, Word or a photo/scan)
  agreements: { maxMb: 25, types: /^(application\/pdf|image\/(png|jpe?g|webp)|application\/(msword|vnd\.openxmlformats-officedocument\.wordprocessingml\.document))$/ },
} as const;

/**
 * Issues a signed upload URL (valid ~2h) so the browser uploads straight to Supabase Storage.
 * Only admins upload course images and files (course authoring is admin-only).
 */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await allow("upload", user.id, LIMITS.upload.limit, LIMITS.upload.window))) return NextResponse.json({ error: "Too many uploads, try again later" }, { status: 429 });
  const { bucket, filename, contentType, size, courseId } = (await request.json().catch(() => ({}))) as {
    bucket?: keyof typeof BUCKETS; filename?: string; contentType?: string; size?: number; courseId?: string;
  };
  const rule = bucket && BUCKETS[bucket];
  if (!rule || !filename) return NextResponse.json({ error: "bad request" }, { status: 400 });
  if (size && size > rule.maxMb * 1024 * 1024) return NextResponse.json({ error: `File is larger than ${rule.maxMb} MB` }, { status: 413 });
  if (contentType && !rule.types.test(contentType)) return NextResponse.json({ error: "File type not allowed" }, { status: 415 });

  const db = createAdminClient();
  if (!hasRole(user, "admin")) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const safe = filename.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(-80) || "file";
  const path = `${courseId ?? "site"}/${Date.now()}-${safe}`;
  const { data, error } = await db.storage.from(bucket).createSignedUploadUrl(path);
  if (error || !data) return NextResponse.json({ error: error?.message ?? "could not sign upload" }, { status: 500 });

  const publicUrl = bucket === "course-images" ? db.storage.from(bucket).getPublicUrl(path).data.publicUrl : null;
  return NextResponse.json({ path, token: data.token, publicUrl });
}
