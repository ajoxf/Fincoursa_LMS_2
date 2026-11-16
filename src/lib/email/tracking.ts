import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";

/**
 * Per-person email tracking. Opens: a 1x1 image (fincoursa.com/api/e/o). Clicks: every web link goes through
 * fincoursa.com/api/e/c, which records the click and forwards to the real page. Links are signed so the
 * redirect can't be used to send people to other sites.
 */
const key = () => process.env.UNSUBSCRIBE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "dev-unsubscribe";
const sign = (s: string) => createHmac("sha256", key()).update(`track:${s}`).digest("base64url").slice(0, 22);
const same = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(String(b)); return x.length === y.length && timingSafeEqual(x, y); };

export const verifyOpen = (r: string, s: string) => /^\d{1,18}$/.test(r) && same(sign(`o:${r}`), s);
export const verifyClick = (r: string, u: string, s: string) => /^\d{1,18}$/.test(r) && /^https?:\/\//i.test(u) && same(sign(`c:${r}:${u}`), s);

const unescapeHref = (h: string) => h.replace(/&amp;/g, "&");
const escapeAttr = (h: string) => h.replace(/&/g, "&amp;").replace(/"/g, "&quot;");

/** Route every web link (except unsubscribe links) through the click tracker and add the open pixel. */
export function addTracking(html: string, recipientId: number | string) {
  const r = String(recipientId);
  const base = env.siteUrl;
  const tracked = html.replace(/href="(https?:\/\/[^"]+)"/gi, (whole, raw: string) => {
    const url = unescapeHref(raw);
    if (/unsubscribe/i.test(url)) return whole;
    const t = `${base}/api/e/c?r=${r}&u=${encodeURIComponent(url)}&s=${sign(`c:${r}:${url}`)}`;
    return `href="${escapeAttr(t)}"`;
  });
  const pixel = `<img src="${escapeAttr(`${base}/api/e/o?r=${r}&s=${sign(`o:${r}`)}`)}" width="1" height="1" alt="" border="0" style="display:block;width:1px;height:1px;border:0;opacity:0">`;
  return tracked.includes("</body>") ? tracked.replace("</body>", `${pixel}</body>`) : tracked + pixel;
}
