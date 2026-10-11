"use server";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { getSetting, setSetting, type IntroVideo } from "@/lib/site-settings";

async function update(patch: Partial<IntroVideo>) {
  const admin = await requireRole(["admin"]);
  const current = (await getSetting<IntroVideo>("intro_video")) ?? {};
  await setSetting("intro_video", { ...current, ...patch }, admin.id);
  revalidatePath("/admin/site");
  revalidatePath("/");
}

export async function setIntroPoster(url: string | null) {
  if (url && !/^https:\/\//.test(url)) throw new Error("Invalid image");
  await update({ poster_url: url });
}

export async function setIntroThumbTime(form: FormData) {
  const t = Math.max(0, Math.min(3600, Math.round(Number(form.get("thumb_time")) || 0)));
  await update({ thumb_time: t });
}

/** Take the intro video off the home page. */
export async function removeIntroVideo() {
  await update({ upload_id: null, asset_id: null, playback_id: null, status: undefined });
}

export async function refreshIntro() {
  await requireRole(["admin"]);
  revalidatePath("/admin/site");
}
