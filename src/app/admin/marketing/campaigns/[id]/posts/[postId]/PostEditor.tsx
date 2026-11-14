"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileUpload } from "@/components/dash/FileUpload";
import { composerUrl, LINKEDIN, type PostMedia } from "@/lib/linkedin";
import { addPostMedia, moveMediaUp, removePostMedia, savePost } from "../../../../post-actions";
import { LinkedInPreview, type Identity } from "./LinkedInPreview";

type Post = { id: string; title: string; body: string; post_as: "page" | "profile"; planned_for: string | null; status: string };

export function PostEditor({ post, media, link, page, profile, pageUrl }: {
  post: Post; media: PostMedia[]; link: string; pageUrl: string | null;
  page: Omit<Identity, "postAs">; profile: Omit<Identity, "postAs">;
}) {
  const router = useRouter();
  const area = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState(post.body);
  const [as, setAs] = useState<"page" | "profile">(post.post_as);
  const [view, setView] = useState<"desktop" | "mobile">("desktop");
  const [note, setNote] = useState<{ ok?: string; err?: string }>({});
  const posted = post.status === "posted";
  const over = text.length > LINKEDIN.maxChars;
  const hasLink = text.includes(link);
  const kinds = new Set(media.map((m) => m.kind));
  const accept = kinds.has("image") ? "image/png,image/jpeg,image/webp,image/gif" : media.length ? "" : "image/png,image/jpeg,image/webp,image/gif,video/mp4,video/quicktime,application/pdf";

  function insertLink() {
    const el = area.current;
    const at = el ? el.selectionStart : text.length;
    const before = text.slice(0, at), after = text.slice(at);
    const pad = before && !before.endsWith("\n") && !before.endsWith(" ") ? "\n\n" : "";
    setText(`${before}${pad}${link}${after}`);
  }

  async function copyAndOpen() {
    try { await navigator.clipboard.writeText(text); } catch { /* the textarea stays selectable */ }
    window.open(composerUrl(as, pageUrl, text), "_blank", "noopener");
    setNote({ ok: as === "profile"
      ? "LinkedIn opened with the text filled in (it is also copied). Attach the media, check it, and post."
      : pageUrl ? "Text copied. In LinkedIn, click Start a post, paste (Ctrl or Cmd + V), attach the media, and post."
        : "Text copied. Add the Company Page link in Marketing → Settings so this opens the page's composer." });
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_auto]">
      <form action={savePost.bind(null, post.id)} className="grid content-start gap-4 text-sm">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
          <label className="grid gap-1">Name (only you see this)<input name="title" defaultValue={post.title} className="fc-input !py-1.5" /></label>
          <label className="grid gap-1">Post as<select name="post_as" value={as} onChange={(e) => setAs(e.target.value as "page" | "profile")} className="fc-input !py-1.5">
            <option value="page">Company Page</option><option value="profile">Personal profile</option></select></label>
          <label className="grid gap-1">Planned for<input type="date" name="planned_for" defaultValue={post.planned_for ?? ""} className="fc-input !py-1.5" /></label>
        </div>

        <label className="grid gap-1">
          <span className="flex items-center justify-between gap-3">Post text
            <button type="button" onClick={insertLink} className="text-xs underline">{hasLink ? "Insert tracked link again" : "Insert this post's tracked link"}</button></span>
          <textarea ref={area} name="body" value={text} onChange={(e) => setText(e.target.value)} rows={14} className="fc-input font-[system-ui] text-[14px] leading-5"
            placeholder="Write the post. The first two or three lines are all most people see before …more, so lead with the point." />
        </label>
        <div className="flex flex-wrap justify-between gap-2 text-xs">
          <span className={over ? "font-semibold text-danger" : "text-muted"}>{text.length.toLocaleString()} / {LINKEDIN.maxChars.toLocaleString()} characters</span>
          {!hasLink && <span className="text-muted">No tracked link in the text yet, so clicks from this post can&apos;t be counted.</span>}
        </div>

        <div className="grid gap-2 rounded-lg border border-line p-3">
          <p className="font-medium">Images, video or PDF</p>
          <p className="text-xs text-muted">LinkedIn takes up to {LINKEDIN.maxImages} images, or one video (MP4 or MOV, up to {LINKEDIN.maxVideoMb} MB), or one PDF (shown as swipeable pages). Not a mix. Square or 4:5 images take the most space in the feed.</p>
          {media.length > 0 && (
            <ul className="grid gap-2">
              {media.map((m, i) => (
                <li key={m.id} className="flex items-center gap-3">
                  {m.kind === "image"
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={m.public_url} alt="" className="h-12 w-12 rounded object-cover" />
                    : <span className="grid h-12 w-12 place-items-center rounded bg-surface text-xs font-semibold uppercase">{m.kind === "video" ? "Video" : "PDF"}</span>}
                  <span className="min-w-0 flex-1 truncate">{m.name}</span>
                  <a href={`${m.public_url}?download=${encodeURIComponent(m.name ?? "file")}`} className="text-xs underline">Download</a>
                  {i > 0 && <button formAction={moveMediaUp.bind(null, post.id, m.id)} className="text-xs underline">Move up</button>}
                  <button formAction={removePostMedia.bind(null, post.id, m.id)} className="text-xs text-muted underline">Remove</button>
                </li>
              ))}
            </ul>
          )}
          {accept && (
            <FileUpload bucket="marketing-media" courseId={post.id} accept={accept} label={media.length ? "Add another image" : "Upload image, video or PDF"}
              onUploaded={async (f) => {
                const r = await addPostMedia(post.id, f);
                if (r?.error) setNote({ err: r.error }); else { setNote({}); router.refresh(); }
              }} />
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {!posted && <label className="flex items-center gap-2"><input type="checkbox" name="status" value="ready" defaultChecked={post.status === "ready"} /> Ready to post</label>}
          {posted && <input type="hidden" name="status" value="posted" />}
          <button disabled={over} className="fc-btn fc-btn-dark !min-w-0 !px-5 !py-2">Save</button>
        </div>
        {note.err && <p className="rounded-lg bg-danger/10 p-3 text-danger">{note.err}</p>}
        {note.ok && <p className="rounded-lg bg-success/10 p-3 text-success">{note.ok}</p>}
      </form>

      <div className="grid content-start justify-items-start gap-3">
        <div className="flex items-center gap-3 text-sm">
          <span className="font-medium">Preview</span>
          {(["desktop", "mobile"] as const).map((v) => (
            <button key={v} type="button" onClick={() => setView(v)} className={`rounded-full px-3 py-1 ${view === v ? "bg-ink text-white" : "bg-surface"}`}>{v === "desktop" ? "Desktop" : "Phone"}</button>
          ))}
        </div>
        <div className={view === "mobile" ? "rounded-[28px] border-[10px] border-[#1b1f23] bg-[#f3f2ef] py-3" : "rounded-lg bg-[#f3f2ef] p-4"}>
          <LinkedInPreview who={{ postAs: as, ...(as === "page" ? page : profile) }} text={text} media={media} width={view === "mobile" ? 360 : 555} />
        </div>
        <button type="button" onClick={copyAndOpen} disabled={over || !text.trim()} className="fc-btn fc-btn-primary !min-w-0 !px-5 !py-2">
          Copy text and open LinkedIn
        </button>
        <p className="max-w-[555px] text-xs text-muted">
          The post is published in LinkedIn itself, so you get all of LinkedIn&apos;s features (mentions, scheduling, alt text, document titles) and see
          exactly what goes out. {media.length ? "Download the media above and attach it there in the same order." : ""}
        </p>
      </div>
    </div>
  );
}
