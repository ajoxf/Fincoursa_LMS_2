"use client";
import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Uploaded = { path: string; publicUrl: string | null; name: string };

/** Uploads one file to Supabase Storage through a server-signed URL. */
export function FileUpload({ bucket, courseId, accept, label = "Upload file", onUploaded }: {
  bucket: "course-images" | "course-files" | "agreements" | "site-files"; courseId?: string; accept?: string; label?: string;
  onUploaded: (f: Uploaded) => void | Promise<void>;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<{ busy: boolean; error?: string }>({ busy: false });

  async function upload(file: File) {
    setState({ busy: true });
    try {
      const res = await fetch("/api/uploads", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bucket, filename: file.name, contentType: file.type, size: file.size, courseId }),
      });
      const signed = await res.json();
      if (!res.ok) throw new Error(signed.error ?? "Upload not allowed");
      const { error } = await createClient().storage.from(bucket).uploadToSignedUrl(signed.path, signed.token, file, { contentType: file.type });
      if (error) throw error;
      await onUploaded({ path: signed.path, publicUrl: signed.publicUrl, name: file.name });
      setState({ busy: false });
    } catch (e) {
      setState({ busy: false, error: e instanceof Error ? e.message : "Upload failed" });
    } finally {
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <input ref={input} type="file" accept={accept} className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
      <button type="button" disabled={state.busy} onClick={() => input.current?.click()} className="fc-btn fc-btn-outline !px-4 !py-2 text-sm">
        {state.busy ? "Uploading…" : label}
      </button>
      {state.error && <span className="text-sm text-danger">{state.error}</span>}
    </div>
  );
}
