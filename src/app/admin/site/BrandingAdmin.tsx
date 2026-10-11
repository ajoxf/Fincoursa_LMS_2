"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileUpload } from "@/components/dash/FileUpload";
import type { Branding } from "@/lib/site-settings";
import { savePartners, setLogo } from "./actions";

/* eslint-disable @next/next/no-img-element */

function LogoSlot({ kind, label, hint, url, dark }: { kind: "logo_dark" | "logo_white"; label: string; hint: string; url: string | null; dark: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div className="grid gap-2">
      <p className="text-sm font-medium">{label}</p>
      <div className={`flex h-28 items-center justify-center rounded-card border border-line p-4 ${dark ? "bg-black" : "bg-white"}`}>
        {url ? <img src={url} alt="" className="max-h-12 w-auto object-contain" /> : <span className={`text-xs ${dark ? "text-white/60" : "text-muted"}`}>No logo yet: a text logo is shown</span>}
      </div>
      <p className="text-xs text-muted">{hint}</p>
      <div className="flex flex-wrap items-center gap-3">
        <FileUpload bucket="course-images" accept="image/png,image/svg+xml,image/webp,image/jpeg" label={url ? "Replace" : "Upload"}
          onUploaded={async (f) => { await setLogo(kind, f.publicUrl); router.refresh(); }} />
        {url && <button type="button" disabled={pending} onClick={() => start(async () => { await setLogo(kind, null); router.refresh(); })} className="text-xs text-danger underline">Remove</button>}
      </div>
    </div>
  );
}

export function LogosAdmin({ branding }: { branding: Branding }) {
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <LogoSlot kind="logo_dark" label="Logo for white backgrounds" hint="Dark logo: floating menu bar, certificates." url={branding.logo_dark ?? null} dark={false} />
      <LogoSlot kind="logo_white" label="Logo for black backgrounds" hint="White logo: top of the site, footer, lesson player." url={branding.logo_white ?? null} dark />
    </div>
  );
}

type Partner = { name: string; logo_url: string | null };

/** The scrolling "Industry experts" strip on the home page. */
export function PartnersAdmin({ branding, defaults }: { branding: Branding; defaults: string[] }) {
  const router = useRouter();
  const [list, setList] = useState<Partner[]>(branding.partners?.length ? branding.partners : defaults.map((name) => ({ name, logo_url: null })));
  const [saved, setSaved] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = (i: number, p: Partial<Partner>) => { setSaved(null); setList((l) => l.map((x, j) => (j === i ? { ...x, ...p } : x))); };
  const move = (i: number, d: number) => setList((l) => { const n = [...l]; const j = i + d; if (j < 0 || j >= n.length) return l; [n[i], n[j]] = [n[j], n[i]]; return n; });

  return (
    <div className="grid gap-3">
      {list.map((p, i) => (
        <div key={i} className="grid items-center gap-3 rounded-card border border-line p-3 md:grid-cols-[140px_1fr_auto]">
          <div className="flex h-14 items-center justify-center rounded-lg bg-white px-2">
            {p.logo_url ? <img src={p.logo_url} alt="" className="max-h-8 w-auto object-contain" /> : <span className="text-center text-xs text-muted">Name shown as text</span>}
          </div>
          <div className="grid gap-2">
            <input value={p.name} onChange={(e) => set(i, { name: e.target.value })} placeholder="Organisation name" className="fc-input" />
            <div className="flex flex-wrap items-center gap-3">
              <FileUpload bucket="course-images" accept="image/png,image/svg+xml,image/webp,image/jpeg" label={p.logo_url ? "Replace logo" : "Upload logo"}
                onUploaded={(f) => set(i, { logo_url: f.publicUrl })} />
              {p.logo_url && <button type="button" onClick={() => set(i, { logo_url: null })} className="text-xs text-danger underline">Remove logo</button>}
            </div>
          </div>
          <div className="flex gap-3 text-xs md:flex-col md:items-end">
            <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="underline disabled:opacity-30">Move up</button>
            <button type="button" onClick={() => move(i, 1)} disabled={i === list.length - 1} className="underline disabled:opacity-30">Move down</button>
            <button type="button" onClick={() => { setSaved(null); setList((l) => l.filter((_, j) => j !== i)); }} className="text-danger underline">Delete</button>
          </div>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => setList((l) => [...l, { name: "", logo_url: null }])} className="fc-btn fc-btn-outline !min-w-0 !px-4 !py-2 text-sm text-ink">+ Add organisation</button>
        <button type="button" disabled={pending} onClick={() => start(async () => { await savePartners(list); setSaved("Saved. The home page is updated."); router.refresh(); })}
          className="fc-btn fc-btn-primary !min-w-0 !px-5 !py-2 text-sm">{pending ? "Saving…" : "Save list"}</button>
        {saved && <span className="text-sm text-success">{saved}</span>}
      </div>
      <p className="text-xs text-muted">Tip: logos with a transparent background (PNG or SVG) look best. Changes to this list show after you press Save list.</p>
    </div>
  );
}
