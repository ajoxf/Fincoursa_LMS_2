"use client";
import { assetUrl, isThinkificAsset } from "@/lib/assets";
import { useActionState, useState } from "react";
import { saveInstructor, type FormState } from "../actions";
import { FileUpload } from "@/components/dash/FileUpload";

/* eslint-disable @typescript-eslint/no-explicit-any */
export function InstructorForm({ ins, loginEmail }: { ins: any; loginEmail: string | null }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveInstructor.bind(null, ins.id), null);
  // old Thinkific image links no longer work: treat them as empty so the admin sees "Upload"
  const live = (u: string | null) => (u && !isThinkificAsset(u) ? u : "");
  const [photo, setPhoto] = useState<string>(live(ins.photo_url));
  const [logo, setLogo] = useState<string>(live(ins.org_logo_url));
  return (
    <form key={JSON.stringify([ins.name, ins.title, ins.bio, ins.photo_url, ins.org_logo_url, ins.user_id, ins.is_published, ins.default_revenue_share_pct])} action={action} className="grid gap-4">
      <div className="grid gap-6 md:grid-cols-[200px_1fr]">
        <div className="grid content-start gap-2">
          <div className="aspect-[4/5] overflow-hidden rounded-card bg-surface">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {photo && <img src={assetUrl(photo)} alt="" className="h-full w-full object-cover" />}
          </div>
          <input type="hidden" name="photo_url" value={photo} />
          <FileUpload bucket="course-images" accept="image/*" label={photo ? "Replace photo" : "Upload photo"} onUploaded={(f) => setPhoto(f.publicUrl ?? "")} />
          <p className="mt-2 text-sm font-medium">Company logo (white, for dark cards)</p>
          <div className="flex h-12 items-center justify-center rounded-md bg-surface-dark px-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {logo && <img src={assetUrl(logo)} alt="" className="max-h-8" />}
          </div>
          <input type="hidden" name="org_logo_url" value={logo} />
          <FileUpload bucket="course-images" accept="image/*" label={logo ? "Replace logo" : "Upload logo"} onUploaded={(f) => setLogo(f.publicUrl ?? "")} />
          {logo && <button type="button" onClick={() => setLogo("")} className="justify-self-start text-xs text-danger underline">Remove logo</button>}
        </div>
        <div className="grid content-start gap-4">
          <label className="grid gap-1 text-sm font-medium">Name<input name="name" defaultValue={ins.name} required className="fc-input" /></label>
          <label className="grid gap-1 text-sm font-medium">Title / role<input name="title" defaultValue={ins.title ?? ""} placeholder="e.g. President, Kase and Company" className="fc-input" /></label>
          <label className="grid gap-1 text-sm font-medium">Bio<textarea name="bio" rows={5} defaultValue={ins.bio ?? ""} className="fc-input" /></label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1 text-sm font-medium">Default revenue share %
              <input name="default_revenue_share_pct" type="number" min={0} max={100} step="0.5" defaultValue={ins.default_revenue_share_pct} className="fc-input" /></label>
            <label className="flex items-center gap-2 self-end pb-3 text-sm"><input type="checkbox" name="is_published" defaultChecked={ins.is_published} />Show on the Instructors page</label>
          </div>
          <div className="rounded-md border border-line p-3">
            <p className="text-sm font-medium">Instructor login</p>
            <p className="text-xs text-muted">{loginEmail ? `Linked to ${loginEmail}. They can see their courses, students and earnings. Only admins can change course content.` : "Not linked. Enter the email they signed up with to give them an instructor dashboard."}</p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <input name="login_email" type="email" placeholder={loginEmail ?? "instructor@example.com"} className="fc-input max-w-sm" />
              {loginEmail && <label className="flex items-center gap-2 text-xs"><input type="checkbox" name="unlink" />Unlink login</label>}
            </div>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button disabled={pending} className="fc-btn fc-btn-primary">{pending ? "Saving…" : "Save instructor"}</button>
        {state?.ok && <span className="text-sm text-success">Saved</span>}
        {state?.error && <span className="text-sm text-danger">{state.error}</span>}
      </div>
    </form>
  );
}
