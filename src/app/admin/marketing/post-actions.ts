"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { LINKEDIN, nextVariant } from "@/lib/campaign-posts";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const go = (path: string, k: "ok" | "err", msg: string): never => redirect(`${path}${path.includes("?") ? "&" : "?"}${k}=${encodeURIComponent(msg)}`);
const staff = () => requireRole(["admin", "support", "finance"]);
const editor = (campaignId: string, postId: string) => `/admin/marketing/campaigns/${campaignId}/posts/${postId}`;
const count = (f: FormData, k: string) => { const v = str(f, k).replace(/[,\s]/g, ""); return v === "" ? null : Math.max(0, Math.round(Number(v) || 0)); };

async function postOf(id: string) {
  const { data } = await createAdminClient().from("campaign_posts").select("id, campaign_id, status").eq("id", id).maybeSingle();
  if (!data) go("/admin/marketing?tab=campaigns", "err", "That post no longer exists.");
  return data!;
}
function refresh(campaignId: string, postId?: string) {
  revalidatePath(`/admin/marketing/campaigns/${campaignId}`);
  if (postId) revalidatePath(editor(campaignId, postId));
}

/** New draft post in a campaign, with its own tracked-link variant (p1, p2, …). */
export async function createPost(campaignId: string) {
  const me = await staff();
  const db = createAdminClient();
  const { data: existing } = await db.from("campaign_posts").select("variant").eq("campaign_id", campaignId);
  const variant = nextVariant((existing ?? []).map((p) => p.variant));
  const { data, error } = await db.from("campaign_posts").insert({ campaign_id: campaignId, variant, title: `Post ${variant.slice(1)}`, created_by: me.id }).select("id").single();
  if (error || !data) go(`/admin/marketing/campaigns/${campaignId}`, "err", error?.message ?? "Could not add a post.");
  refresh(campaignId);
  redirect(editor(campaignId, data!.id));
}

export async function savePost(id: string, form: FormData) {
  await staff();
  const p = await postOf(id);
  const body = String(form.get("body") ?? "").replace(/\r\n/g, "\n");
  if (body.length > LINKEDIN.maxChars) go(editor(p.campaign_id, id), "err", `LinkedIn allows ${LINKEDIN.maxChars.toLocaleString()} characters. This post has ${body.length.toLocaleString()}.`);
  const status = p.status === "posted" ? undefined : str(form, "status") === "ready" ? "ready" : "draft";
  const { error } = await createAdminClient().from("campaign_posts").update({
    title: str(form, "title").slice(0, 120) || "Untitled post", body,
    post_as: str(form, "post_as") === "profile" ? "profile" : "page",
    planned_for: /^\d{4}-\d{2}-\d{2}$/.test(str(form, "planned_for")) ? str(form, "planned_for") : null,
    status, updated_at: new Date().toISOString(),
  }).eq("id", id);
  if (error) go(editor(p.campaign_id, id), "err", error.message);
  refresh(p.campaign_id, id);
  go(editor(p.campaign_id, id), "ok", "Saved.");
}

/** Called by the uploader once the file is in storage. Follows LinkedIn's rule: images, or one video, or one PDF. */
export async function addPostMedia(id: string, file: { path: string; publicUrl: string | null; name: string; contentType: string; size: number }) {
  await staff();
  const p = await postOf(id);
  if (!file.publicUrl || !file.path.startsWith(`${id}/`)) return { error: "Upload not recognised." };
  const kind = file.contentType.startsWith("image/") ? "image" : file.contentType.startsWith("video/") ? "video" : file.contentType === "application/pdf" ? "document" : null;
  if (!kind) return { error: "Use an image, an MP4 or MOV video, or a PDF." };
  const db = createAdminClient();
  const { data: have } = await db.from("campaign_post_media").select("kind, position").eq("post_id", id);
  const kinds = new Set((have ?? []).map((m) => m.kind));
  const remove = () => db.storage.from("marketing-media").remove([file.path]);
  if (kinds.size && !kinds.has(kind)) { await remove(); return { error: "LinkedIn posts can have images, or one video, or one PDF, not a mix. Remove the current media first." }; }
  if (kind !== "image" && (have ?? []).length) { await remove(); return { error: `A LinkedIn post can have one ${kind}. Remove the current one first.` }; }
  if (kind === "image" && (have ?? []).length >= LINKEDIN.maxImages) { await remove(); return { error: `LinkedIn allows up to ${LINKEDIN.maxImages} images.` }; }
  if (kind === "document" && file.size > LINKEDIN.maxDocMb * 1024 * 1024) { await remove(); return { error: `LinkedIn documents can be up to ${LINKEDIN.maxDocMb} MB.` }; }
  await db.from("campaign_post_media").insert({
    post_id: id, kind, path: file.path, public_url: file.publicUrl, name: file.name.slice(0, 200), content_type: file.contentType, size_bytes: file.size,
    position: Math.max(-1, ...(have ?? []).map((m) => m.position)) + 1,
  });
  refresh(p.campaign_id, id);
  return { ok: true };
}

export async function removePostMedia(id: string, mediaId: string) {
  await staff();
  const p = await postOf(id);
  const db = createAdminClient();
  const { data } = await db.from("campaign_post_media").delete().eq("id", mediaId).eq("post_id", id).select("path").maybeSingle();
  if (data?.path) await db.storage.from("marketing-media").remove([data.path]);
  refresh(p.campaign_id, id);
  go(editor(p.campaign_id, id), "ok", "Removed.");
}

/** Move an image one place earlier (LinkedIn shows them in this order). */
export async function moveMediaUp(id: string, mediaId: string) {
  await staff();
  const p = await postOf(id);
  const db = createAdminClient();
  const { data: list } = await db.from("campaign_post_media").select("id, position").eq("post_id", id).order("position");
  const i = (list ?? []).findIndex((m) => m.id === mediaId);
  if (i > 0) {
    const a = list![i], b = list![i - 1];
    await db.from("campaign_post_media").update({ position: b.position }).eq("id", a.id);
    await db.from("campaign_post_media").update({ position: a.position }).eq("id", b.id);
  }
  refresh(p.campaign_id, id);
  redirect(editor(p.campaign_id, id));
}

/** After publishing on LinkedIn: keep the post's link so the team can find it. */
export async function markPosted(id: string, form: FormData) {
  await staff();
  const p = await postOf(id);
  const url = str(form, "post_url");
  if (url && !/^https:\/\/(www\.)?linkedin\.com\//i.test(url)) go(editor(p.campaign_id, id), "err", "Paste the link to the post on linkedin.com.");
  const when = /^\d{4}-\d{2}-\d{2}$/.test(str(form, "posted_on")) ? `${str(form, "posted_on")}T12:00:00Z` : new Date().toISOString();
  await createAdminClient().from("campaign_posts").update({ status: "posted", post_url: url || null, posted_at: when, updated_at: new Date().toISOString() }).eq("id", id);
  refresh(p.campaign_id, id);
  go(editor(p.campaign_id, id), "ok", "Marked as posted. Add LinkedIn's numbers after a few days.");
}

export async function unmarkPosted(id: string) {
  await staff();
  const p = await postOf(id);
  await createAdminClient().from("campaign_posts").update({ status: "ready", posted_at: null, updated_at: new Date().toISOString() }).eq("id", id);
  refresh(p.campaign_id, id);
  go(editor(p.campaign_id, id), "ok", "Back to ready to post.");
}

/** Numbers copied from the post's analytics on LinkedIn. */
export async function savePostMetrics(id: string, form: FormData) {
  await staff();
  const p = await postOf(id);
  await createAdminClient().from("campaign_posts").update({
    impressions: count(form, "impressions"), reactions: count(form, "reactions"), comments: count(form, "comments"), reposts: count(form, "reposts"),
    metrics_updated_at: new Date().toISOString(),
  }).eq("id", id);
  refresh(p.campaign_id, id);
  go(editor(p.campaign_id, id), "ok", "Numbers saved.");
}

export async function duplicatePost(id: string) {
  const me = await staff();
  const db = createAdminClient();
  const { data: src } = await db.from("campaign_posts").select("campaign_id, title, body, post_as").eq("id", id).maybeSingle();
  if (!src) go("/admin/marketing?tab=campaigns", "err", "That post no longer exists.");
  const { data: existing } = await db.from("campaign_posts").select("variant").eq("campaign_id", src!.campaign_id);
  const variant = nextVariant((existing ?? []).map((p) => p.variant));
  const { data } = await db.from("campaign_posts").insert({ campaign_id: src!.campaign_id, variant, title: `${src!.title} (copy)`.slice(0, 120), body: src!.body, post_as: src!.post_as, created_by: me.id }).select("id").single();
  refresh(src!.campaign_id);
  go(editor(src!.campaign_id, data!.id), "ok", `Copied as a new post with its own link (?v=${variant}). Media is not copied.`);
}

export async function deletePost(id: string) {
  await staff();
  const p = await postOf(id);
  const db = createAdminClient();
  const { data: media } = await db.from("campaign_post_media").select("path").eq("post_id", id);
  if (media?.length) await db.storage.from("marketing-media").remove(media.map((m) => m.path));
  await db.from("campaign_posts").delete().eq("id", id);
  refresh(p.campaign_id);
  go(`/admin/marketing/campaigns/${p.campaign_id}`, "ok", "Post deleted. Clicks already counted stay with the campaign.");
}
