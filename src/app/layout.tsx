import type { Metadata } from "next";
import "./globals.css";
import { env } from "@/lib/env";
import { getBranding } from "@/lib/site-settings";
import { BrandProvider } from "@/components/site/BrandContext";

export const metadata: Metadata = {
  metadataBase: new URL(env.siteUrl),
  title: { default: "FinCoursa Academy", template: "%s | FinCoursa Academy" },
  description: "Real-World Expertise for the Future of Business. Learn from industry practitioners.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const b = await getBranding();
  return (
    <html lang="en" className="h-full antialiased">
      <head>
        <link rel="preconnect" href="https://api.fontshare.com" crossOrigin="" />
        <link rel="stylesheet" href="https://api.fontshare.com/v2/css?f[]=satoshi@300,400,500,700&display=swap" />
      </head>
      <body className="min-h-full flex flex-col"><BrandProvider logos={{ dark: b.logo_dark ?? null, white: b.logo_white ?? null }}>{children}</BrandProvider></body>
    </html>
  );
}
