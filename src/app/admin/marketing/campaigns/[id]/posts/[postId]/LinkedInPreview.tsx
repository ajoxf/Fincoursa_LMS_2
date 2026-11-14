"use client";
import { useLayoutEffect, useRef, useState } from "react";
import type { PostMedia } from "@/lib/linkedin";

export type Identity = { postAs: "page" | "profile"; name: string; subline: string; logoUrl: string | null };

// LinkedIn's feed: system font, 14px on 20px lines, 3 lines before "…more"; post column 555px on desktop, full width on a phone.
const FONT = '-apple-system, system-ui, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", "Fira Sans", Ubuntu, Oxygen, "Oxygen Sans", Cantarell, "Droid Sans", sans-serif';
const BLUE = "#0a66c2";
const TOKEN = /(https?:\/\/[^\s]+|#[\p{L}\p{N}_]+|@[\p{L}][\p{L}\p{N}_.-]*)/gu;

function Rich({ text }: { text: string }) {
  return <>{text.split(TOKEN).map((part, i) => (i % 2 ? <span key={i} style={{ color: BLUE, fontWeight: 600 }}>{part}</span> : part))}</>;
}

function Globe() {
  return <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden><path d="M8 1a7 7 0 107 7 7 7 0 00-7-7zM3 8a5 5 0 011-3l.64.55a1 1 0 01.36.76V7.5a.5.5 0 00.5.5h1.73a1 1 0 01.89.55L8.5 10l-.94 1.89a1 1 0 01-.56.5l-1 .33A5 5 0 013 8zm8.77 3.16l-.86-.86a1 1 0 01-.29-.71V8.5a1 1 0 00-1-1H8.1L7.5 6l.84-.84A1 1 0 019.05 5h1.25l.6-.6A5 5 0 0111.77 11.16z" /></svg>;
}

function Images({ items }: { items: PostMedia[] }) {
  const img = (m: PostMedia, cls: string, extra?: React.ReactNode) => (
    <div key={m.id} className={`relative overflow-hidden bg-[#f3f2ef] ${cls}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={m.public_url} alt="" className="h-full w-full object-cover" />
      {extra}
    </div>
  );
  if (items.length === 1) {
    return (
      // a single image keeps its shape, up to 4:5 tall
      // eslint-disable-next-line @next/next/no-img-element
      <img src={items[0].public_url} alt="" className="block max-h-[calc(var(--w)*1.25)] w-full object-cover" />
    );
  }
  if (items.length === 2) return <div className="grid grid-cols-2 gap-0.5">{items.map((m) => img(m, "aspect-square"))}</div>;
  const top = items.length >= 5 ? items.slice(0, 2) : items.slice(0, 1);
  const rest = items.slice(top.length, top.length + 3);
  const more = items.length - top.length - rest.length;
  return (
    <div className="grid gap-0.5">
      <div className={`grid gap-0.5 ${top.length === 2 ? "grid-cols-2" : ""}`}>{top.map((m) => img(m, top.length === 2 ? "aspect-square" : "aspect-[1.91/1]"))}</div>
      <div className={`grid gap-0.5 ${rest.length === 2 ? "grid-cols-2" : "grid-cols-3"}`}>
        {rest.map((m, i) => img(m, "aspect-square", i === rest.length - 1 && more > 0
          ? <span className="absolute inset-0 grid place-items-center bg-black/55 text-2xl font-semibold text-white">+{more}</span> : null))}
      </div>
    </div>
  );
}

/** How the post will look in the LinkedIn feed, collapsed at "…more" like LinkedIn. */
export function LinkedInPreview({ who, text, media, width }: { who: Identity; text: string; media: PostMedia[]; width: number }) {
  const box = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [cut, setCut] = useState(false);
  useLayoutEffect(() => {
    const el = box.current;
    if (el && !open) setCut(el.scrollHeight > el.clientHeight + 1);
  }, [text, width, open]);
  const url = !media.length ? text.match(/https?:\/\/[^\s]+/)?.[0] : undefined;
  const video = media.find((m) => m.kind === "video"), doc = media.find((m) => m.kind === "document");
  const images = media.filter((m) => m.kind === "image");

  return (
    <div className="overflow-hidden rounded-lg border border-black/10 bg-white text-left shadow-sm" style={{ width, fontFamily: FONT, ["--w" as string]: `${width}px` }}>
      <div className="flex gap-2 px-4 pt-3">
        {who.logoUrl
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={who.logoUrl} alt="" className={`h-12 w-12 object-contain ${who.postAs === "profile" ? "rounded-full" : "rounded-sm"} border border-black/5 bg-white`} />
          : <span className={`grid h-12 w-12 place-items-center bg-[#1b1f23] text-lg font-semibold text-white ${who.postAs === "profile" ? "rounded-full" : "rounded-sm"}`}>{who.name.slice(0, 1)}</span>}
        <div className="min-w-0 leading-4">
          <p className="truncate text-[14px] font-semibold" style={{ color: "rgba(0,0,0,.9)" }}>{who.name}</p>
          {who.subline && <p className="truncate text-[12px]" style={{ color: "rgba(0,0,0,.6)" }}>{who.subline}</p>}
          <p className="flex items-center gap-1 text-[12px]" style={{ color: "rgba(0,0,0,.6)" }}>Now · <Globe /></p>
        </div>
      </div>

      <div className="relative px-4 pt-2 pb-2">
        <div ref={box} className="whitespace-pre-wrap break-words text-[14px]" style={{ lineHeight: "20px", color: "rgba(0,0,0,.9)", ...(open ? {} : { maxHeight: 60, overflow: "hidden" }) }}>
          {text ? <Rich text={text} /> : <span style={{ color: "rgba(0,0,0,.4)" }}>Your post text appears here.</span>}
        </div>
        {cut && !open && (
          <button type="button" onClick={() => setOpen(true)} className="absolute bottom-2 right-4 bg-white pl-1 text-[14px]" style={{ lineHeight: "20px", color: "rgba(0,0,0,.6)" }}>…more</button>
        )}
        {open && <button type="button" onClick={() => setOpen(false)} className="text-[12px] underline" style={{ color: "rgba(0,0,0,.6)" }}>Collapse preview</button>}
      </div>

      {images.length > 0 && <Images items={images} />}
      {video && <video src={video.public_url} controls preload="metadata" className="block w-full bg-black" />}
      {doc && (
        <div className="border-y border-black/10">
          <p className="bg-[#1b1f23] px-3 py-2 text-[13px] font-semibold text-white">{(doc.name ?? "Document").replace(/\.pdf$/i, "")}</p>
          <object data={`${doc.public_url}#page=1&toolbar=0&view=FitH`} type="application/pdf" className="block aspect-[4/5] w-full bg-[#f3f2ef]">
            <p className="grid aspect-[4/5] place-items-center text-[13px]" style={{ color: "rgba(0,0,0,.6)" }}>PDF document. LinkedIn shows it as pages people swipe through.</p>
          </object>
        </div>
      )}
      {url && (
        <div className="mx-0 border-y border-black/10 bg-[#edf3f8] px-3 py-3">
          <p className="text-[14px] font-semibold" style={{ color: "rgba(0,0,0,.9)" }}>Link preview</p>
          <p className="text-[12px]" style={{ color: "rgba(0,0,0,.6)" }}>LinkedIn adds the page&apos;s title and image here when it reads {(() => { try { return new URL(url).host; } catch { return "the link"; } })()}. Posts with an image or document usually reach more people than link posts.</p>
        </div>
      )}

      <div className="mx-4 grid grid-cols-4 border-t border-black/10 py-1 text-center text-[14px] font-semibold" style={{ color: "rgba(0,0,0,.6)" }}>
        {["Like", "Comment", "Repost", "Send"].map((a) => <span key={a} className="py-2">{a}</span>)}
      </div>
    </div>
  );
}
