"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import MuxUploader from "@mux/mux-uploader-react";
import { FileUpload } from "@/components/dash/FileUpload";
import { assetUrl } from "@/lib/assets";
import type { IntroVideo } from "@/lib/site-settings";
import { removeIntroVideo, setIntroPoster, setIntroThumbTime } from "./actions";

/** Upload / replace the home page intro video and its poster image. */
export function IntroVideoAdmin({ video }: { video: IntroVideo | null }) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [pending, start] = useTransition();
  const playback = video?.playback_id ?? null;
  const processing = video?.status === "processing";
  const poster = video?.poster_url ?? (playback ? `https://image.mux.com/${playback}/thumbnail.webp?width=960&time=${video?.thumb_time ?? 3}` : null);

  return (
    <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
      <div>
        <div className="relative aspect-video overflow-hidden rounded-card border border-line bg-surface">
          {poster ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={assetUrl(poster)} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted">
              No intro video yet. Upload one and it appears under the headline on the home page.
            </div>
          )}
          {playback && (
            <span className="absolute left-1/2 top-1/2 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white/85">
              <svg width="18" height="18" viewBox="0 0 22 22" aria-hidden><path d="M6 3.5v15l13-7.5z" fill="#2b1d12" /></svg>
            </span>
          )}
        </div>
        <p className="mt-2 text-sm">
          {processing ? <span className="text-warning">Processing the new video. This usually takes a few minutes; refresh this page to check.{playback ? " The current video stays on the site until then." : ""}</span>
            : video?.status === "errored" ? <span className="text-danger">That video couldn&apos;t be processed. Try uploading it again (MP4 or MOV works best).</span>
            : playback ? <span className="text-success">Live on the home page.</span>
            : <span className="text-muted">Not shown on the home page.</span>}
        </p>
        {processing && <button type="button" onClick={() => router.refresh()} className="mt-2 text-sm underline">Refresh status</button>}
      </div>

      <div className="grid content-start gap-5">
        <div className="grid gap-2">
          <p className="text-sm font-medium">{playback || processing ? "Replace the video" : "Upload the video"}</p>
          <MuxUploader
            endpoint={async () => {
              const res = await fetch("/api/video/intro-upload", { method: "POST" });
              const j = await res.json().catch(() => ({}));
              if (!res.ok) throw new Error(j.error ?? "Upload isn't available right now.");
              return j.uploadUrl as string;
            }}
            onSuccess={() => { setMsg({ ok: true, t: "Uploaded. Processing usually takes a few minutes." }); setTimeout(() => router.refresh(), 4000); }}
            onUploadError={() => setMsg({ ok: false, t: "The upload failed. Please try again." })}
            className="w-full"
          />
          <p className="text-xs text-muted">MP4 or MOV, landscape (16:9) looks best.</p>
        </div>

        <div className="grid gap-2">
          <p className="text-sm font-medium">Cover image (optional)</p>
          <p className="text-xs text-muted">Shown before the video plays. Without one, a frame from the video is used.</p>
          <div className="flex flex-wrap items-center gap-3">
            <FileUpload bucket="course-images" accept="image/*" label={video?.poster_url ? "Replace cover image" : "Upload cover image"}
              onUploaded={async (f) => { await setIntroPoster(f.publicUrl); router.refresh(); }} />
            {video?.poster_url && (
              <button type="button" disabled={pending} onClick={() => start(async () => { await setIntroPoster(null); router.refresh(); })} className="text-xs text-danger underline">Remove cover image</button>
            )}
          </div>
          {!video?.poster_url && playback && (
            <form action={setIntroThumbTime} className="flex items-end gap-2 text-sm">
              <label className="grid gap-1">Use the frame at (seconds)
                <input name="thumb_time" type="number" min={0} defaultValue={video?.thumb_time ?? 3} className="fc-input w-28" />
              </label>
              <button className="fc-btn fc-btn-outline !min-w-0 !px-4 !py-2 text-ink">Update</button>
            </form>
          )}
        </div>

        {msg && <p className={`text-sm ${msg.ok ? "text-success" : "text-danger"}`}>{msg.t}</p>}
        {(playback || processing) && (
          <button type="button" disabled={pending}
            onClick={() => { if (confirm("Remove the intro video from the home page?")) start(async () => { await removeIntroVideo(); router.refresh(); }); }}
            className="justify-self-start text-sm text-danger underline">Remove video from home page</button>
        )}
      </div>
    </div>
  );
}
