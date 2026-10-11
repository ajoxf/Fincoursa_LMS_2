/**
 * Thinkific's CDN blocks its images from loading on other websites (hotlink protection), so images that
 * still live there are served through our own /api/img proxy until they're copied into our storage
 * (Admin > Import from Thinkific > Copy images). Safe to use on client and server.
 */
const THINKIFIC = /^https:\/\/([a-z0-9-]+\.)*thinkific\.com\//i;

export function isThinkificAsset(url: string | null | undefined) {
  return Boolean(url && THINKIFIC.test(url));
}

export function assetUrl<T extends string | null | undefined>(url: T): T {
  if (!url || !THINKIFIC.test(url)) return url;
  return `/api/img?u=${encodeURIComponent(url)}` as T;
}

/** Absolute version for emails and other off-site uses. */
export function absoluteAssetUrl(url: string, siteUrl: string) {
  const u = assetUrl(url);
  return u.startsWith("/") ? `${siteUrl.replace(/\/$/, "")}${u}` : u;
}
