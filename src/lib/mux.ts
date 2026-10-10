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
