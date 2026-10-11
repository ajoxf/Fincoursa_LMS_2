import { NextResponse } from "next/server";
import { getSessionUser, hasRole } from "@/lib/auth";
import { createPublicUpload } from "@/lib/mux";
import { getSetting, setSetting, type IntroVideo } from "@/lib/site-settings";
import { env } from "@/lib/env";

// Admin uploads the home page intro video; the browser sends the file straight to the video host.
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user || !hasRole(user, "admin")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  try {
    const upload = await createPublicUpload(request.headers.get("origin") ?? env.siteUrl);
    const current = (await getSetting<IntroVideo>("intro_video")) ?? {};
    await setSetting("intro_video", {
      poster_url: current.poster_url ?? null, thumb_time: current.thumb_time ?? 3,
      // the current video stays on the home page until the new one is ready
      upload_id: upload.id, asset_id: null, playback_id: current.playback_id ?? null, status: "processing",
    }, user.id);
    return NextResponse.json({ uploadUrl: upload.url });
  } catch (e) {
    console.error("[intro-upload]", e);
    return NextResponse.json({ error: "Video upload isn't available right now." }, { status: 500 });
  }
}
