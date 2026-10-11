"use client";
import { assetUrl } from "@/lib/assets";
import { useActionState, useState } from "react";
import { saveBundle, type FormState } from "../actions";
import { FileUpload } from "@/components/dash/FileUpload";
import { minorUnitsFactor } from "@/lib/money";

/* eslint-disable @typescript-eslint/no-explicit-any */
export function BundleForm({ bundle, price }: { bundle: any; price: { amount_minor: number; currency: string } | null }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveBundle.bind(null, bundle.id), null);
  const [thumb, setThumb] = useState<string>(bundle.thumbnail_url ?? "");
  const cur = price?.currency ?? (process.env.NEXT_PUBLIC_DEFAULT_CURRENCY ?? "USD");
  return (
    <form key={JSON.stringify([bundle.title, bundle.slug, bundle.status, bundle.is_featured, bundle.thumbnail_url, price?.amount_minor])} action={action} className="grid gap-4">
      <div className="grid gap-4 lg:grid-cols-[1fr_260px]">
        <div className="grid gap-4">
          <label className="grid gap-1 text-sm font-medium">Title<input name="title" defaultValue={bundle.title} required className="fc-input" /></label>
          <label className="grid gap-1 text-sm font-medium">Bundle page URL
            <div className="flex items-center gap-1 text-sm text-muted">/bundles/<input name="slug" defaultValue={bundle.slug} className="fc-input flex-1" /></div></label>
          <label className="grid gap-1 text-sm font-medium">Description<textarea name="description" rows={4} defaultValue={bundle.description ?? ""} className="fc-input" /></label>
        </div>
        <div className="grid content-start gap-2">
          <p className="text-sm font-medium">Image</p>
          <div className="aspect-video overflow-hidden rounded-card border border-line bg-surface">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {thumb && <img src={assetUrl(thumb)} alt="" className="h-full w-full object-cover" />}
          </div>
          <input type="hidden" name="thumbnail_url" value={thumb} />
          <FileUpload bucket="course-images" accept="image/*" label={thumb ? "Replace image" : "Upload image"} onUploaded={(f) => setThumb(f.publicUrl ?? "")} />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-4">
        <label className="grid gap-1 text-sm font-medium">Price (0 = free)
          <input name="amount" type="number" min={0} step="0.01" defaultValue={price ? price.amount_minor / minorUnitsFactor(cur) : 0} className="fc-input" /></label>
        <label className="grid gap-1 text-sm font-medium">Currency<input name="currency" defaultValue={cur} maxLength={3} className="fc-input uppercase" /></label>
        <label className="grid gap-1 text-sm font-medium">Status
          <select name="status" defaultValue={bundle.status} className="fc-input"><option value="draft">Draft</option><option value="published">Published</option><option value="archived">Archived</option></select></label>
        <label className="flex items-center gap-2 self-end pb-3 text-sm"><input type="checkbox" name="is_featured" defaultChecked={bundle.is_featured} />Show on home page</label>
      </div>
      <div className="flex items-center gap-3">
        <button disabled={pending} className="fc-btn fc-btn-primary">{pending ? "Saving…" : "Save bundle"}</button>
        {state?.ok && <span className="text-sm text-success">Saved</span>}
        {state?.error && <span className="text-sm text-danger">{state.error}</span>}
      </div>
    </form>
  );
}
