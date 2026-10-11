"use server";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { getSetting, setSetting, type Branding, type IntroVideo } from "@/lib/site-settings";

async function update(patch: Partial<IntroVideo>) {
  const admin = await requireRole(["admin"]);
  const current = (await getSetting<IntroVideo>("intro_video")) ?? {};
  await setSetting("intro_video", { ...current, ...patch }, admin.id);
  revalidatePath("/admin/site");
  revalidatePath("/");
}

export async function setIntroPoster(url: string | null) {
  if (url && !/^https?:\/\//.test(url)) throw new Error("Invalid image");
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

const httpsOrNull = (u: string | null) => {
  if (u && !/^https?:\/\/|^\//.test(u)) throw new Error("Invalid image");
  return u;
};

async function updateBranding(patch: Partial<Branding>) {
  const admin = await requireRole(["admin"]);
  const current = (await getSetting<Branding>("branding")) ?? {};
  await setSetting("branding", { ...current, ...patch }, admin.id);
  revalidatePath("/", "layout"); // logos appear on every page
}

export async function setLogo(kind: "logo_dark" | "logo_white", url: string | null) {
  await updateBranding({ [kind]: httpsOrNull(url) });
}

/** Replace the whole "Industry experts" list (names + logos, in order). */
export async function savePartners(list: { name: string; logo_url: string | null }[]) {
  const clean = list.slice(0, 20)
    .map((p) => ({ name: String(p.name ?? "").trim().slice(0, 80), logo_url: httpsOrNull(p.logo_url || null) }))
    .filter((p) => p.name || p.logo_url)
    .map((p) => ({ ...p, name: p.name || "Partner" }));
  await updateBranding({ partners: clean });
}
