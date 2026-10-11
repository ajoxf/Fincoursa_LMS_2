import "server-only";
import Mux from "@mux/mux-node";
import { serverSecret } from "@/lib/env";

let client: Mux | null = null;

export function mux() {
  if (!client) {
    client = new Mux({
      tokenId: serverSecret("MUX_TOKEN_ID"),
      tokenSecret: serverSecret("MUX_TOKEN_SECRET"),
      webhookSecret: process.env.MUX_WEBHOOK_SECRET ?? null,
      jwtSigningKey: process.env.MUX_SIGNING_KEY_ID ?? null,
      jwtPrivateKey: process.env.MUX_SIGNING_PRIVATE_KEY ?? null, // base64-encoded private key from Mux
    });
  }
  return client;
}

/** Short-lived signed tokens for a lesson video (playback, thumbnail, storyboard). */
export async function signPlayback(playbackId: string, viewerId: string) {
  return mux().jwt.signPlaybackId(playbackId, {
    type: ["video", "thumbnail", "storyboard"],
    expiration: "4h",
    params: { sub: viewerId },
  });
}

/** Creates a direct-upload URL. The video_assets row id travels as passthrough so the webhook can link it. */
export async function createDirectUpload(videoAssetId: string, corsOrigin: string) {
  return mux().video.uploads.create({
    cors_origin: corsOrigin,
    new_asset_settings: {
      playback_policies: ["signed"],
      passthrough: videoAssetId,
      video_quality: "basic",
      max_resolution_tier: "1080p",
    },
  });
}

/** Import a video Mux can fetch from a URL (e.g. a Zoom cloud recording). Linked back via passthrough. */
export async function createAssetFromUrl(videoAssetId: string, url: string) {
  return mux().video.assets.create({
    inputs: [{ url }],
    playback_policies: ["signed"],
    passthrough: videoAssetId,
    video_quality: "basic",
    max_resolution_tier: "1080p",
  });
}

/**
 * Fallback for when the Mux webhook isn't set up (or missed an event): ask Mux about this course's
 * videos that are still processing and record the ones that are ready. Cheap; only touches pending rows.
 */
export async function syncPendingVideos(courseId: string) {
  if (!process.env.MUX_TOKEN_ID || !process.env.MUX_TOKEN_SECRET) return;
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const db = createAdminClient();
  const { data: rows } = await db.from("lessons").select("id, video:video_assets(id, upload_id, asset_id, status)")
    .eq("course_id", courseId).not("video_asset_id", "is", null);
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const pending = (rows ?? []).map((r: any) => (Array.isArray(r.video) ? r.video[0] : r.video))
    .filter((v: any) => v && v.status !== "ready" && v.status !== "errored");
  for (const v of pending.slice(0, 10)) {
    try {
      let assetId: string | null = v.asset_id;
      if (!assetId && v.upload_id) assetId = (await mux().video.uploads.retrieve(v.upload_id)).asset_id ?? null;
      if (!assetId) continue;
      const a: any = await mux().video.assets.retrieve(assetId);
      if (a.status === "ready") {
        const playback = (a.playback_ids ?? []).find((p: any) => p.policy === "signed") ?? a.playback_ids?.[0];
        await db.from("video_assets").update({ asset_id: a.id, status: "ready", playback_id: playback?.id ?? null,
          duration_seconds: a.duration ?? null, aspect_ratio: a.aspect_ratio ?? null }).eq("id", v.id);
        if (a.duration) await db.from("lessons").update({ duration_seconds: Math.round(a.duration) }).eq("video_asset_id", v.id);
      } else if (a.status === "errored") {
        await db.from("video_assets").update({ asset_id: a.id, status: "errored" }).eq("id", v.id);
      } else if (!v.asset_id) {
        await db.from("video_assets").update({ asset_id: a.id, status: "processing" }).eq("id", v.id);
      }
    } catch { /* leave it for the next look */ }
  }
  /* eslint-enable @typescript-eslint/no-explicit-any */
}

/** Direct upload for a public marketing video (e.g. the home page intro): anyone can watch it. */
export async function createPublicUpload(corsOrigin: string) {
  return mux().video.uploads.create({
    cors_origin: corsOrigin,
    new_asset_settings: { playback_policies: ["public"], video_quality: "basic", max_resolution_tier: "1080p" },
  });
}
