"use client";
import { brand } from "./brand";
import { useBrandLogos } from "./BrandContext";

/** FinCoursa logo: the uploaded image (Admin → Home page) when available, otherwise a text wordmark. */
export function Logo({ tone, className = "h-7 md:h-8" }: { tone: "light" | "dark"; className?: string }) {
  const logos = useBrandLogos();
  // tone "light" = white logo for dark backgrounds
  const src = tone === "light" ? logos.white ?? brand.logoFooter : logos.dark ?? brand.logoHeader;
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={brand.name} className={`w-auto object-contain ${className}`} />;
  }
  return (
    <span className={`inline-flex items-center gap-1.5 font-heading text-[26px] font-bold leading-none tracking-tight ${tone === "light" ? "text-white" : "text-ink"}`} aria-label={brand.name}>
      <span aria-hidden className={`flex h-7 w-7 items-center justify-center rounded-md text-[17px] font-black ${tone === "light" ? "bg-white text-black" : "bg-ink text-white"}`}>F</span>
      FinCoursa
    </span>
  );
}
