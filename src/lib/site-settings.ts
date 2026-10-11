import "server-only";
import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { mux } from "@/lib/mux";
import { mergeHome, type HomeContent } from "@/lib/home-content";

/** Home page intro video, uploaded by an admin on /admin/site. */
export type IntroVideo = {
  upload_id?: string | null;
  asset_id?: string | null;
  playback_id?: string | null;
  status?: "processing" | "ready" | "errored";
  /** optional poster image; otherwise a frame from the video */
  poster_url?: string | null;
  /** seconds into the video for the automatic poster frame */
  thumb_time?: number;
};

export async function getSetting<T>(key: string): Promise<T | null> {
  try {
    const { data, error } = await createAdminClient().from("site_settings").select("value").eq("key", key).maybeSingle();
    return error ? null : ((data?.value as T) ?? null);
  } catch {
    return null; // not configured yet (demo mode)
  }
}

export async function setSetting(key: string, value: object, userId?: string) {
  const { error } = await createAdminClient().from("site_settings")
    .upsert({ key, value, updated_at: new Date().toISOString(), updated_by: userId ?? null }, { onConflict: "key" });
  if (error) throw new Error(error.message);
}

/** The intro video; while it's processing, ask Mux whether it's ready yet. */
export const getIntroVideo = cache(async (): Promise<IntroVideo | null> => {
  const v = await getSetting<IntroVideo>("intro_video");
  if (!v || v.status !== "processing" || !v.upload_id) return v;
  try {
    const assetId = v.asset_id ?? (await mux().video.uploads.retrieve(v.upload_id)).asset_id ?? null;
    if (!assetId) return v;
    const a = await mux().video.assets.retrieve(assetId);
    const next: IntroVideo = { ...v, asset_id: assetId };
    if (a.status === "ready") {
      next.status = "ready";
      next.playback_id = (a.playback_ids ?? []).find((p) => p.policy === "public")?.id ?? null;
    } else if (a.status === "errored") next.status = "errored";
    if (next.status !== v.status || next.asset_id !== v.asset_id) await setSetting("intro_video", next);
    return next;
  } catch {
    return v;
  }
});

/** Logos and the "Industry experts" strip, uploaded by an admin on /admin/site. */
export type Branding = {
  /** dark logo for white backgrounds */
  logo_dark?: string | null;
  /** white logo for black backgrounds */
  logo_white?: string | null;
  partners?: { name: string; logo_url: string | null }[];
};

export const getBranding = cache(async (): Promise<Branding> => (await getSetting<Branding>("branding")) ?? {});

/** Home page wording (Admin → Home page & logos → Home page text), over the original defaults. */
export const getHomeContent = cache(async (): Promise<HomeContent> => mergeHome(await getSetting<Record<string, unknown>>("home_text")));
