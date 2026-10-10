import { NextResponse } from "next/server";
import { mux } from "@/lib/mux";
import { createAdminClient } from "@/lib/supabase/admin";

// Mux -> us: keeps video_assets in sync with upload/encoding status.
export async function POST(request: Request) {
  const body = await request.text();
  let event;
  try {
    event = await mux().webhooks.unwrap(body, request.headers);
  } catch {
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }
  const db = createAdminClient();
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const data = event.data as any;

  switch (event.type) {
    case "video.upload.asset_created":
      await db.from("video_assets").update({ asset_id: data.asset_id, status: "processing" }).eq("upload_id", data.id);
      break;
    case "video.asset.ready": {
      const playback = (data.playback_ids ?? []).find((p: any) => p.policy === "signed") ?? data.playback_ids?.[0];
      const update = {
        asset_id: data.id, status: "ready", playback_id: playback?.id ?? null,
        duration_seconds: data.duration ?? null, aspect_ratio: data.aspect_ratio ?? null,
      };
      if (data.passthrough) await db.from("video_assets").update(update).eq("id", data.passthrough);
      else await db.from("video_assets").update(update).eq("asset_id", data.id);
      // keep lesson durations in step with the real video length
      if (data.duration && data.passthrough) {
        await db.from("lessons").update({ duration_seconds: Math.round(data.duration) }).eq("video_asset_id", data.passthrough);
      }
      break;
    }
    case "video.asset.errored":
      await db.from("video_assets").update({ status: "errored" }).eq("asset_id", data.id);
      break;
    case "video.upload.errored":
    case "video.upload.cancelled":
      await db.from("video_assets").update({ status: "errored" }).eq("upload_id", data.id);
      break;
  }
  /* eslint-enable @typescript-eslint/no-explicit-any */
  return NextResponse.json({ received: true });
}
