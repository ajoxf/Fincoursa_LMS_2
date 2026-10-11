"use client";
import { createContext, useContext } from "react";

export type BrandLogos = { dark: string | null; white: string | null };
const Ctx = createContext<BrandLogos>({ dark: null, white: null });

/** Makes the admin-uploaded logos available to every <Logo>, including in client components. */
export function BrandProvider({ logos, children }: { logos: BrandLogos; children: React.ReactNode }) {
  return <Ctx.Provider value={logos}>{children}</Ctx.Provider>;
}

export const useBrandLogos = () => useContext(Ctx);
