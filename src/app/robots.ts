import type { MetadataRoute } from "next";
import { env } from "@/lib/env";

/** Search engines may index the public site, not accounts, checkout or the admin. */
export default function robots(): MetadataRoute.Robots {
  const base = env.siteUrl.replace(/\/$/, "");
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/dashboard", "/learn", "/checkout", "/instructor", "/affiliate", "/api", "/users"] },
    sitemap: `${base}/sitemap.xml`,
  };
}
