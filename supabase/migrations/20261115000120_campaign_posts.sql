-- Posts inside a campaign (Admin → Marketing → Campaigns → a campaign → Posts).
-- A post is written and previewed here, then published in LinkedIn's own composer (copy text, attach the media).
-- Each post has its own tracked link (/go/<campaign code>?v=<variant>), so clicks, sign-ups and sales are counted per post.
-- Engagement (impressions, reactions, comments, reposts) is copied in from LinkedIn after posting.

create table if not exists public.campaign_posts (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  variant text not null check (variant ~ '^[a-z0-9-]{1,30}$'),       -- the ?v= in the post's tracked link
  title text not null default 'Untitled post',                       -- internal name, not shown on LinkedIn
  body text not null default '',
  post_as text not null default 'page' check (post_as in ('page', 'profile')),
  planned_for date,
  status text not null default 'draft' check (status in ('draft', 'ready', 'posted')),
  posted_at timestamptz, post_url text,
  impressions int, reactions int, comments int, reposts int, metrics_updated_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (campaign_id, variant)
);
create index if not exists campaign_posts_campaign on public.campaign_posts (campaign_id, planned_for);

create table if not exists public.campaign_post_media (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.campaign_posts(id) on delete cascade,
  kind text not null check (kind in ('image', 'video', 'document')),
  path text not null, public_url text not null, name text, content_type text, size_bytes bigint,
  position int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists campaign_post_media_post on public.campaign_post_media (post_id, position);

alter table public.campaign_posts enable row level security;
alter table public.campaign_post_media enable row level security;
drop policy if exists "staff read campaign posts" on public.campaign_posts;
create policy "staff read campaign posts" on public.campaign_posts for select using (public.is_staff());
drop policy if exists "staff read campaign post media" on public.campaign_post_media;
create policy "staff read campaign post media" on public.campaign_post_media for select using (public.is_staff());

-- Images, videos and PDFs for posts. Public so they can be previewed and downloaded; uploads go through
-- server-signed URLs after an admin check (no client insert policies). 200 MB covers LinkedIn-sized videos.
do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('marketing-media', 'marketing-media', true, 209715200,
      array['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'video/mp4', 'video/quicktime', 'application/pdf'])
    on conflict (id) do nothing;
  end if;
end $$;
