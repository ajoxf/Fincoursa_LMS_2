import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createAssetFromUrl } from "@/lib/mux";

/**
 * Zoom -> us. Set up a Zoom "webhook only" app with the event "Recording completed" pointing here,
 * and put its Secret Token in ZOOM_WEBHOOK_SECRET_TOKEN.
 * When a cloud recording is ready, the MP4 is handed to Mux and attached to every live lesson
 * with that meeting ID, so buyers can replay it in their account.
 */
const sign = (secret: string, msg: string) => crypto.createHmac("sha256", secret).update(msg).digest("hex");

type ZoomFile = { file_type?: string; recording_type?: string; download_url?: string; status?: string; file_size?: number };
const PREFERRED = ["shared_screen_with_speaker_view", "shared_screen_with_gallery_view", "active_speaker", "gallery_view", "shared_screen"];

export async function POST(request: Request) {
  const secret = process.env.ZOOM_WEBHOOK_SECRET_TOKEN;
  if (!secret) return NextResponse.json({ error: "not configured" }, { status: 404 });
  const raw = await request.text();
  /* eslint-disable @typescript-eslint/no-explicit-any */
  let body: any;
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ error: "bad request" }, { status: 400 }); }

  // Zoom checks the URL when you save the app
  if (body.event === "endpoint.url_validation") {
    const plainToken = String(body.payload?.plainToken ?? "");
    return NextResponse.json({ plainToken, encryptedToken: sign(secret, plainToken) });
  }

  const ts = request.headers.get("x-zm-request-timestamp") ?? "";
  const expected = `v0=${sign(secret, `v0:${ts}:${raw}`)}`;
  const got = request.headers.get("x-zm-signature") ?? "";
  if (got.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(got), Buffer.from(expected))) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return NextResponse.json({ error: "stale" }, { status: 401 });
  if (body.event !== "recording.completed") return NextResponse.json({ received: true });

  const obj = body.payload?.object ?? {};
  const meetingId = String(obj.id ?? "").replace(/\D/g, "");
  const files: ZoomFile[] = (obj.recording_files ?? []).filter((f: ZoomFile) => f.file_type === "MP4" && f.status !== "processing" && f.download_url);
  const file = PREFERRED.map((t) => files.find((f) => f.recording_type === t)).find(Boolean) ?? files.sort((a, b) => (b.file_size ?? 0) - (a.file_size ?? 0))[0];
  if (!meetingId || !file?.download_url) return NextResponse.json({ received: true, skipped: "no mp4" });
  /* eslint-enable @typescript-eslint/no-explicit-any */

  const db = createAdminClient();
  // A recurring meeting can host several sessions: attach to the most recent session that has started and has no recording yet.
  const { data: lessons } = await db.from("lessons").select("id, title, starts_at, video_asset_id")
    .eq("zoom_meeting_id", meetingId).eq("type", "live").lte("starts_at", new Date().toISOString())
    .order("starts_at", { ascending: false });
  const target = (lessons ?? []).find((l) => !l.video_asset_id);
  if (!target) return NextResponse.json({ received: true, skipped: "no matching lesson" });

  const { data: asset, error } = await db.from("video_assets")
    .insert({ title: `${target.title} (Zoom recording)`, status: "processing" }).select("id").single();
  if (error || !asset) return NextResponse.json({ error: "could not create asset" }, { status: 500 });
  const token = body.download_token ? `${file.download_url.includes("?") ? "&" : "?"}access_token=${encodeURIComponent(body.download_token)}` : "";
  const created = await createAssetFromUrl(asset.id, file.download_url + token);
  await db.from("video_assets").update({ asset_id: created.id }).eq("id", asset.id);
  await db.from("lessons").update({ video_asset_id: asset.id }).eq("id", target.id).is("video_asset_id", null);
  return NextResponse.json({ received: true, lesson: target.id });
}
