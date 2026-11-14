import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { env } from "@/lib/env";
import { formatDate } from "@/lib/format";
import { fmtUsd } from "@/lib/marketing-metrics";
import { getTracking } from "@/lib/tracking";
import { getBranding } from "@/lib/site-settings";
import { POST_STATUS, postResults, type PostMedia } from "@/lib/campaign-posts";
import { Card } from "@/components/dash/Stat";
import { deletePost, duplicatePost, markPosted, savePostMetrics, unmarkPosted } from "../../../../post-actions";
import { PostEditor } from "./PostEditor";

export const metadata: Metadata = { title: "Post" };

export default async function PostPage({ params, searchParams }: PageProps<"/admin/marketing/campaigns/[id]/posts/[postId]">) {
  await requireRole(["admin", "support", "finance"], "/admin/marketing");
  const { id, postId } = await params;
  const sp = await searchParams;
  const db = createAdminClient();
  const [{ data: c }, { data: p }, { data: media }, t, brand, results] = await Promise.all([
    db.from("campaigns").select("id, name, code").eq("id", id).maybeSingle(),
    db.from("campaign_posts").select("*").eq("id", postId).eq("campaign_id", id).maybeSingle(),
    db.from("campaign_post_media").select("id, kind, public_url, name, content_type, size_bytes, position").eq("post_id", postId).order("position"),
    getTracking(), getBranding(), postResults(id),
  ]);
  if (!c || !p) notFound();
  const link = `${env.siteUrl.replace(/\/$/, "")}/go/${c.code}?v=${p.variant}`;
  const r = results.get(p.variant) ?? { clicks: 0, signups: 0, customers: 0, revenue: 0 };
  const engaged = (p.reactions ?? 0) + (p.comments ?? 0) + (p.reposts ?? 0);
  const f = "fc-input !py-1.5";

  return (
    <div className="grid gap-6">
      <div className="grid gap-2">
        <Link href={`/admin/marketing/campaigns/${id}`} className="text-sm underline">← {c.name}</Link>
        <h1 className="text-3xl font-bold text-primary">{p.title}</h1>
        <p className="text-sm text-muted">{POST_STATUS.find(([v]) => v === p.status)?.[1]}{p.planned_for ? ` · planned for ${formatDate(p.planned_for)}` : ""}
          {" "}· tracked link <code className="break-all">{link}</code></p>
      </div>
      {typeof sp.ok === "string" && <p className="rounded-lg bg-success/10 p-3 text-sm text-success">{sp.ok}</p>}
      {typeof sp.err === "string" && <p className="rounded-lg bg-danger/10 p-3 text-sm text-danger">{sp.err}</p>}

      <PostEditor
        post={{ id: p.id, title: p.title, body: p.body, post_as: p.post_as, planned_for: p.planned_for, status: p.status }}
        media={(media ?? []) as PostMedia[]} link={link} pageUrl={t.linkedin_page_url ?? null}
        page={{ name: t.linkedin_page_name || "FinCoursa", subline: t.linkedin_page_followers ? `${t.linkedin_page_followers} followers` : "", logoUrl: t.linkedin_page_logo_url || brand.logo_dark || null }}
        profile={{ name: t.linkedin_profile_name || "Your name", subline: t.linkedin_profile_headline || "", logoUrl: null }}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="1. After you post it">
          {p.status !== "posted" ? (
            <form action={markPosted.bind(null, p.id)} className="grid gap-2 text-sm">
              <p className="text-muted">On LinkedIn, open the post, click the three dots, and Copy link to post.</p>
              <input name="post_url" placeholder="https://www.linkedin.com/feed/update/…" className={f} />
              <label className="grid gap-1">Posted on<input type="date" name="posted_on" className={f} /></label>
              <button className="fc-btn fc-btn-dark justify-self-start !min-w-0 !px-4 !py-1.5">Mark as posted</button>
            </form>
          ) : (
            <div className="grid gap-2 text-sm">
              <p>Posted {p.posted_at ? formatDate(p.posted_at) : ""}.</p>
              {p.post_url && <a href={p.post_url} target="_blank" rel="noopener noreferrer" className="break-all underline">Open the post on LinkedIn</a>}
              <form><button formAction={unmarkPosted.bind(null, p.id)} className="text-xs text-muted underline">Not posted after all</button></form>
            </div>
          )}
        </Card>

        <Card title="2. LinkedIn's numbers">
          <form action={savePostMetrics.bind(null, p.id)} className="grid gap-2 text-sm">
            <p className="text-muted">From the post&apos;s analytics on LinkedIn, a few days after posting and again after two weeks.</p>
            <div className="grid grid-cols-2 gap-2">
              {([["impressions", "Impressions"], ["reactions", "Reactions"], ["comments", "Comments"], ["reposts", "Reposts"]] as const).map(([k, l]) => (
                <label key={k} className="grid gap-1">{l}<input name={k} defaultValue={p[k] ?? ""} inputMode="numeric" className={f} /></label>
              ))}
            </div>
            <button className="justify-self-start text-sm underline">Save numbers</button>
            {p.metrics_updated_at && <p className="text-xs text-muted">Updated {formatDate(p.metrics_updated_at)}</p>}
          </form>
        </Card>

        <Card title="3. What it brought in">
          <div className="grid grid-cols-2 gap-2 text-sm">
            {[["Clicks on the link", String(r.clicks)], ["Sign-ups", String(r.signups)], ["Customers", String(r.customers)], ["Revenue", fmtUsd(r.revenue)],
              ["Engagement rate", p.impressions ? `${((engaged / p.impressions) * 100).toFixed(1)}%` : "–"], ["Click rate", p.impressions ? `${((r.clicks / p.impressions) * 100).toFixed(1)}%` : "–"]].map(([k, v]) => (
              <div key={k} className="rounded-lg bg-surface p-3"><p className="text-xs text-muted">{k}</p><p className="text-lg font-bold tabular-nums">{v}</p></div>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted">Counted from this post&apos;s tracked link. Sign-ups are people whose first visit came through it; customers and revenue are purchases made after it.</p>
        </Card>
      </div>

      <form className="flex flex-wrap gap-4 text-sm">
        <button formAction={duplicatePost.bind(null, p.id)} className="underline">Copy as a new post (for an A/B test)</button>
        <button formAction={deletePost.bind(null, p.id)} className="text-danger underline">Delete post</button>
      </form>
    </div>
  );
}
