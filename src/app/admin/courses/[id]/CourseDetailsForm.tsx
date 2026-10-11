"use client";
import { assetUrl } from "@/lib/assets";
import { useActionState, useState } from "react";
import { saveCourseDetails, type FormState } from "../actions";
import { FileUpload } from "@/components/dash/FileUpload";

/* eslint-disable @typescript-eslint/no-explicit-any */
export function CourseDetailsForm({ course, categories, allTags = [] }: { course: any; categories: { id: string; name: string }[]; allTags?: string[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveCourseDetails.bind(null, course.id), null);
  const [thumb, setThumb] = useState<string>(course.thumbnail_url ?? "");

  return (
    <form key={course.updated_at} action={action} className="grid gap-4">
      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <div className="grid gap-4">
          <label className="grid gap-1 text-sm font-medium">Title<input name="title" defaultValue={course.title} required className="fc-input" /></label>
          <label className="grid gap-1 text-sm font-medium">Course page URL
            <div className="flex items-center gap-1 text-sm text-muted">/courses/<input name="slug" defaultValue={course.slug} required className="fc-input flex-1" /></div>
          </label>
          <label className="grid gap-1 text-sm font-medium">Subtitle<input name="subtitle" defaultValue={course.subtitle ?? ""} className="fc-input" /></label>
          <label className="grid gap-1 text-sm font-medium">Description (shown on course cards and the course page)
            <textarea name="description" rows={5} defaultValue={course.description ?? ""} className="fc-input" />
          </label>
          <label className="grid gap-1 text-sm font-medium">What&apos;s included <span className="text-xs font-normal text-muted">One per line, e.g. &ldquo;Live session + Q&amp;A&rdquo;, &ldquo;Recorded sessions on fincoursa.com&rdquo;</span>
            <textarea name="highlights" rows={4} defaultValue={(course.highlights ?? []).join("\n")} className="fc-input" />
          </label>
        </div>
        <div className="grid content-start gap-2">
          <p className="text-sm font-medium">Thumbnail</p>
          <div className="aspect-video overflow-hidden rounded-card border border-line bg-surface">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {thumb ? <img src={assetUrl(thumb)} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-xs text-muted">16:9 image, at least 1280×720</div>}
          </div>
          <input type="hidden" name="thumbnail_url" value={thumb} />
          <FileUpload bucket="course-images" courseId={course.id} accept="image/*" label={thumb ? "Replace image" : "Upload image"}
            onUploaded={(f) => setThumb(f.publicUrl ?? "")} />
          {thumb && <button type="button" onClick={() => setThumb("")} className="justify-self-start text-xs text-danger underline">Remove image</button>}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <label className="grid gap-1 text-sm font-medium">Category
          <select name="category_id" defaultValue={course.category_id ?? ""} className="fc-input">
            <option value="">—</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-medium">…or new category<input name="new_category" placeholder="e.g. Corporate Finance" className="fc-input" /></label>
        <label className="grid gap-1 text-sm font-medium">Level
          <select name="level" defaultValue={course.level ?? ""} className="fc-input">
            <option value="">—</option><option>Beginner</option><option>Intermediate</option><option>Advanced</option><option>All levels</option>
          </select>
        </label>
        <label className="grid gap-1 text-sm font-medium">Access length (days)
          <input name="access_days" type="number" min={0} defaultValue={course.access_days ?? ""} placeholder="Lifetime" className="fc-input" />
        </label>
      </div>

      <label className="grid gap-1 text-sm font-medium">Tags
        <input name="tags" list="course-tags" defaultValue={(course.tags ?? []).join(", ")} placeholder="e.g. Beginner, Crypto, Options" className="fc-input" />
        <datalist id="course-tags">{allTags.map((t) => <option key={t} value={t} />)}</datalist>
        <span className="text-xs font-normal text-muted">Separate with commas, up to 8. Shown as chips on the course and as filters in the catalog. A new tag is created just by typing it.</span>
      </label>

      <div className="flex flex-wrap gap-6 text-sm">
        <label className="flex items-center gap-2"><input type="checkbox" name="is_featured" defaultChecked={course.is_featured} />Show in Featured Courses on the home page</label>
        <label className="flex items-center gap-2"><input type="checkbox" name="certificate_enabled" defaultChecked={course.certificate_enabled} />Issue a certificate on completion</label>
      </div>

      <details>
        <summary className="cursor-pointer text-sm font-medium">Search engine settings</summary>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <label className="grid gap-1 text-sm font-medium">SEO title<input name="seo_title" defaultValue={course.seo_title ?? ""} className="fc-input" /></label>
          <label className="grid gap-1 text-sm font-medium">SEO description<input name="seo_description" defaultValue={course.seo_description ?? ""} className="fc-input" /></label>
        </div>
      </details>

      <div className="flex items-center gap-3">
        <button disabled={pending} className="fc-btn fc-btn-primary">{pending ? "Saving…" : "Save details"}</button>
        {state?.ok && <span className="text-sm text-success">Saved</span>}
        {state?.error && <span className="text-sm text-danger">{state.error}</span>}
      </div>
    </form>
  );
}
