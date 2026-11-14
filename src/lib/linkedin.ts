// Shared by the post editor (browser) and the server.

/** LinkedIn's own limits, so a post prepared here can be published as it is. */
export const LINKEDIN = {
  maxChars: 3000,
  maxImages: 20,
  maxVideoMb: 200,
  maxDocMb: 100,
} as const;

export const POST_STATUS: [string, string][] = [["draft", "Draft"], ["ready", "Ready to post"], ["posted", "Posted"]];

export type PostMedia = { id: string; kind: "image" | "video" | "document"; public_url: string; name: string | null; content_type: string | null; size_bytes: number | null; position: number };

/** The LinkedIn page where staff write the post (its admin composer), or the personal feed composer with the text filled in. */
export function composerUrl(postAs: string, pageUrl: string | null | undefined, text: string) {
  if (postAs === "profile") return `https://www.linkedin.com/feed/?shareActive=true&text=${encodeURIComponent(text)}`;
  const m = (pageUrl ?? "").match(/linkedin\.com\/company\/([^/?#]+)/i);
  return m ? `https://www.linkedin.com/company/${m[1]}/admin/page-posts/published/?share=true` : "https://www.linkedin.com/feed/?shareActive=true";
}
