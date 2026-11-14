-- Campaigns and marketing attribution (Admin → Marketing → Overview / Campaigns).
-- A campaign follows one process: plan → approved → live → review → done (or stopped at any point).
-- Visitors arriving through a campaign's tracked link (or its utm_campaign code) are remembered, so sign-ups,
-- sales and institution enquiries can be credited to it. Spend is logged per campaign, which gives CAC.

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique check (code ~ '^[a-z0-9-]{3,60}$'),        -- used in links: /go/<code>, utm_campaign=<code>
  channel text not null default 'linkedin_ads'
    check (channel in ('linkedin_ads', 'linkedin_organic', 'email', 'partner', 'webinar', 'event', 'referral', 'search', 'other')),
  objective text not null default 'sales' check (objective in ('sales', 'signups', 'institution_leads', 'instructors', 'awareness')),
  audience text, offer text, hypothesis text, landing_url text,
  target_metric text check (target_metric in ('customers', 'signups', 'leads', 'revenue', 'clicks')),
  target_value numeric,
  budget_minor bigint, currency text not null default 'USD',
  starts_on date, ends_on date,
  stage text not null default 'plan' check (stage in ('plan', 'approved', 'live', 'review', 'done', 'stopped')),
  owner_id uuid references public.profiles(id) on delete set null,
  approved_by uuid references public.profiles(id) on delete set null, approved_at timestamptz,
  result_summary text, learnings text,
  decision text check (decision in ('scale', 'iterate', 'stop')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.campaign_costs (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  spent_on date not null,
  amount_minor bigint not null check (amount_minor > 0),
  currency text not null default 'USD',
  note text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists campaign_costs_campaign on public.campaign_costs (campaign_id, spent_on);

create table if not exists public.campaign_clicks (
  id bigint generated always as identity primary key,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  variant text, country text, referrer text,
  created_at timestamptz not null default now()
);
create index if not exists campaign_clicks_campaign on public.campaign_clicks (campaign_id, created_at);

-- the weekly check-in while a campaign is live (part of the process)
create table if not exists public.campaign_checks (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  on_track boolean not null,
  note text not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists campaign_checks_campaign on public.campaign_checks (campaign_id, created_at desc);

-- attribution: where a person first came from, and which campaign each sale and enquiry came through
alter table public.profiles
  add column if not exists acquired_campaign_id uuid references public.campaigns(id) on delete set null,
  add column if not exists acquisition jsonb;
alter table public.orders
  add column if not exists campaign_id uuid references public.campaigns(id) on delete set null,
  add column if not exists touch jsonb;
alter table public.institution_leads
  add column if not exists campaign_id uuid references public.campaigns(id) on delete set null,
  add column if not exists touch jsonb;
create index if not exists profiles_acquired_campaign on public.profiles (acquired_campaign_id);
create index if not exists orders_campaign on public.orders (campaign_id);

alter table public.campaigns enable row level security;
alter table public.campaign_costs enable row level security;
alter table public.campaign_clicks enable row level security;
alter table public.campaign_checks enable row level security;
drop policy if exists "staff read campaigns" on public.campaigns;
create policy "staff read campaigns" on public.campaigns for select using (public.is_staff());
drop policy if exists "staff read campaign costs" on public.campaign_costs;
create policy "staff read campaign costs" on public.campaign_costs for select using (public.is_staff());
drop policy if exists "staff read campaign clicks" on public.campaign_clicks;
create policy "staff read campaign clicks" on public.campaign_clicks for select using (public.is_staff());
drop policy if exists "staff read campaign checks" on public.campaign_checks;
create policy "staff read campaign checks" on public.campaign_checks for select using (public.is_staff());
