-- =====================================================================
-- FinCoursa LMS — core schema
-- Money is stored in minor units (fils/cents) as bigint, with an ISO currency.
-- =====================================================================

create extension if not exists pgcrypto;
create extension if not exists citext;

-- Daily revenue/progress figures are bucketed by business day in Dubai, not UTC.
do $$ begin execute format('alter database %I set timezone to %L', current_database(), 'Asia/Dubai'); end $$;

-- ---------- Enums ----------
create type public.app_role as enum ('student','instructor','affiliate','admin','finance','support');
create type public.publish_status as enum ('draft','published','archived');
create type public.lesson_type as enum ('video','text','quiz','pdf','audio','download','live');
create type public.price_type as enum ('free','one_time','subscription','payment_plan');
create type public.order_status as enum ('pending','paid','failed','cancelled','refunded','partially_refunded');
create type public.enrollment_source as enum ('purchase','bundle','free','admin','organization','migration');
create type public.affiliate_status as enum ('pending','approved','suspended');
create type public.earning_status as enum ('pending','approved','paid','reversed');
create type public.payout_status as enum ('draft','processing','paid','failed','cancelled');
create type public.video_status as enum ('waiting_upload','processing','ready','errored');
create type public.org_type as enum ('corporate','university','custom');

-- ---------- Helpers ----------
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end $$;

-- ---------- Identity ----------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email citext,
  full_name text,
  avatar_url text,
  country_code char(2),
  preferred_currency char(3) default 'AED',
  marketing_opt_in boolean not null default false,
  referred_by_affiliate_id uuid,          -- first affiliate/IB who brought this user (FK added below)
  referred_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();

create table public.user_roles (
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  granted_at timestamptz not null default now(),
  primary key (user_id, role)
);

create or replace function public.has_role(r public.app_role) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.user_roles where user_id = auth.uid() and role = r);
$$;

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.user_roles where user_id = auth.uid() and role in ('admin','finance','support'));
$$;

-- New auth user -> profile + student role
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', ''))
  on conflict (id) do nothing;
  insert into public.user_roles (user_id, role) values (new.id, 'student') on conflict do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- ---------- Catalog ----------
create table public.instructors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete set null,
  slug text unique not null,
  name text not null,
  title text,                -- e.g. "President, Kase and Company"
  bio text,
  photo_url text,
  org_logo_url text,         -- white logo shown on faculty card
  default_revenue_share_pct numeric(5,2) not null default 0 check (default_revenue_share_pct between 0 and 100),
  sort_order int not null default 0,
  is_published boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  sort_order int not null default 0
);

create table public.courses (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  subtitle text,
  description text,
  category_id uuid references public.categories(id) on delete set null,
  thumbnail_url text,
  trailer_video_id uuid,
  duration_minutes int not null default 0,
  level text,
  status public.publish_status not null default 'draft',
  is_featured boolean not null default false,
  access_days int,                       -- null = lifetime access
  certificate_enabled boolean not null default true,
  sort_order int not null default 0,
  seo_title text,
  seo_description text,
  legacy_thinkific_id text unique,       -- migration mapping
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger courses_touch before update on public.courses for each row execute function public.touch_updated_at();
create index on public.courses (status, is_featured);

create table public.course_instructors (
  course_id uuid not null references public.courses(id) on delete cascade,
  instructor_id uuid not null references public.instructors(id) on delete cascade,
  is_primary boolean not null default true,
  revenue_share_pct numeric(5,2) check (revenue_share_pct between 0 and 100), -- null = instructor default
  primary key (course_id, instructor_id)
);

create table public.video_assets (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'mux',
  upload_id text unique,
  asset_id text unique,
  playback_id text,
  status public.video_status not null default 'waiting_upload',
  duration_seconds numeric,
  aspect_ratio text,
  title text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger video_assets_touch before update on public.video_assets for each row execute function public.touch_updated_at();
alter table public.courses add constraint courses_trailer_fk foreign key (trailer_video_id) references public.video_assets(id) on delete set null;

create table public.chapters (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  title text not null,
  position int not null default 0
);
create index on public.chapters (course_id, position);

-- Public curriculum metadata (titles, durations, preview flag)
create table public.lessons (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  chapter_id uuid not null references public.chapters(id) on delete cascade,
  title text not null,
  type public.lesson_type not null default 'video',
  position int not null default 0,
  is_preview boolean not null default false,
  is_required boolean not null default true,     -- counts toward completion
  duration_seconds int not null default 0,
  drip_days int,                                  -- unlock N days after enrollment
  video_asset_id uuid references public.video_assets(id) on delete set null,
  completion_threshold numeric(4,3) not null default 0.9, -- fraction of video watched
  created_at timestamptz not null default now()
);
create index on public.lessons (course_id, position);

-- Protected lesson body (text, quiz definition, file links)
create table public.lesson_bodies (
  lesson_id uuid primary key references public.lessons(id) on delete cascade,
  body jsonb not null default '{}'::jsonb
);

create table public.bundles (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  description text,
  thumbnail_url text,
  status public.publish_status not null default 'draft',
  is_featured boolean not null default false,
  sort_order int not null default 0,
  legacy_thinkific_id text unique,
  created_at timestamptz not null default now()
);

create table public.bundle_courses (
  bundle_id uuid not null references public.bundles(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  position int not null default 0,
  primary key (bundle_id, course_id)
);

-- Prices: one product (course or bundle), many prices (per currency / plan)
create table public.prices (
  id uuid primary key default gen_random_uuid(),
  course_id uuid references public.courses(id) on delete cascade,
  bundle_id uuid references public.bundles(id) on delete cascade,
  type public.price_type not null default 'one_time',
  currency char(3) not null default 'AED',
  amount_minor bigint not null default 0 check (amount_minor >= 0),
  compare_at_minor bigint,
  interval text check (interval in ('month','year')),       -- subscriptions
  installments int check (installments > 1),                  -- payment plans
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  check ((course_id is not null)::int + (bundle_id is not null)::int = 1)
);
create index on public.prices (course_id) where is_active;
create index on public.prices (bundle_id) where is_active;

-- ---------- Commerce ----------
create table public.tax_rates (
  country_code char(2) primary key,
  name text not null,                    -- e.g. 'UAE VAT'
  rate numeric(6,4) not null,            -- 0.05
  prices_include_tax boolean not null default true
);

-- Which gateway to use for which buyer country/currency (admin-editable)
create table public.payment_routes (
  id uuid primary key default gen_random_uuid(),
  country_code char(2),                  -- null = any country
  currency char(3),                      -- null = any currency
  gateway text not null,                 -- matches a registered adapter id, e.g. 'stripe', 'telr', 'tap'
  priority int not null default 100,     -- lower wins
  is_active boolean not null default true
);

create table public.coupons (
  id uuid primary key default gen_random_uuid(),
  code citext unique not null,
  percent_off numeric(5,2) check (percent_off between 0 and 100),
  amount_off_minor bigint,
  currency char(3),
  course_id uuid references public.courses(id) on delete cascade,
  bundle_id uuid references public.bundles(id) on delete cascade,
  max_redemptions int,
  redeemed_count int not null default 0,
  starts_at timestamptz,
  ends_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  check (percent_off is not null or amount_off_minor is not null)
);

create table public.affiliates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique not null references public.profiles(id) on delete cascade,
  code citext unique not null,
  status public.affiliate_status not null default 'pending',
  commission_pct numeric(5,2) not null default 20 check (commission_pct between 0 and 100),
  cookie_days int not null default 30,
  parent_affiliate_id uuid references public.affiliates(id) on delete set null, -- master IB (2-tier)
  override_pct numeric(5,2) not null default 0 check (override_pct between 0 and 100), -- what the master IB earns on this sub-IB's sales
  payout_details jsonb not null default '{}'::jsonb,   -- bank/IBAN, PayPal etc. (staff + owner only)
  website text,
  notes text,
  approved_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.affiliate_clicks (
  id bigint generated always as identity primary key,
  affiliate_id uuid not null references public.affiliates(id) on delete cascade,
  visitor_id text,                 -- first-party cookie id
  landing_path text,
  campaign text,                   -- ?sub= / utm_campaign
  referrer text,
  country_code char(2),
  created_at timestamptz not null default now()
);
create index on public.affiliate_clicks (affiliate_id, created_at);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  number bigint generated always as identity unique,
  user_id uuid not null references public.profiles(id) on delete restrict,
  status public.order_status not null default 'pending',
  currency char(3) not null,
  subtotal_minor bigint not null default 0,
  discount_minor bigint not null default 0,
  tax_minor bigint not null default 0,
  total_minor bigint not null default 0,
  refunded_minor bigint not null default 0,
  tax_rate numeric(6,4) not null default 0,
  billing_country char(2),
  coupon_id uuid references public.coupons(id) on delete set null,
  affiliate_id uuid references public.affiliates(id) on delete set null,
  affiliate_campaign text,
  attribution text check (attribution in ('link','coupon')),   -- a sale is credited through ONE route only
  gateway text,
  gateway_session_id text,
  paid_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger orders_touch before update on public.orders for each row execute function public.touch_updated_at();
create index on public.orders (user_id, created_at desc);
create index on public.orders (status, paid_at);
create unique index on public.orders (gateway, gateway_session_id) where gateway_session_id is not null;

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  course_id uuid references public.courses(id) on delete restrict,
  bundle_id uuid references public.bundles(id) on delete restrict,
  price_id uuid references public.prices(id) on delete set null,
  title text not null,
  unit_amount_minor bigint not null,
  discount_minor bigint not null default 0,
  quantity int not null default 1,
  check ((course_id is not null)::int + (bundle_id is not null)::int = 1)
);
create index on public.order_items (order_id);

-- Raw gateway events (idempotency + audit)
create table public.payment_events (
  id uuid primary key default gen_random_uuid(),
  gateway text not null,
  event_id text not null,
  order_id uuid references public.orders(id) on delete set null,
  type text not null,
  payload jsonb not null,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (gateway, event_id)
);

create table public.refunds (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  amount_minor bigint not null check (amount_minor > 0),
  reason text,
  gateway_refund_id text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

-- ---------- Learning ----------
create table public.enrollments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  source public.enrollment_source not null,
  order_id uuid references public.orders(id) on delete set null,
  bundle_id uuid references public.bundles(id) on delete set null,
  organization_id uuid,
  enrolled_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  progress_pct numeric(5,2) not null default 0,
  last_lesson_id uuid references public.lessons(id) on delete set null,
  last_activity_at timestamptz,
  completed_at timestamptz,
  unique (user_id, course_id)
);
create index on public.enrollments (course_id);

create table public.lesson_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  watched_seconds int not null default 0,       -- unique seconds watched (client-reported, capped)
  last_position_seconds int not null default 0,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, lesson_id)
);
create index on public.lesson_progress (course_id, lesson_id);

create table public.quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  answers jsonb not null,
  score numeric(5,2) not null,
  passed boolean not null,
  created_at timestamptz not null default now()
);

create table public.certificates (
  id uuid primary key default gen_random_uuid(),
  serial text unique not null default upper(encode(gen_random_bytes(6), 'hex')),
  user_id uuid not null references auth.users(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  recipient_name text not null,
  issued_at timestamptz not null default now(),
  unique (user_id, course_id)
);

-- ---------- Earnings & payouts ----------
create table public.payouts (
  id uuid primary key default gen_random_uuid(),
  payee_type text not null check (payee_type in ('instructor','affiliate')),
  instructor_id uuid references public.instructors(id) on delete restrict,
  affiliate_id uuid references public.affiliates(id) on delete restrict,
  currency char(3) not null,
  amount_minor bigint not null,
  status public.payout_status not null default 'draft',
  method text,
  reference text,
  period_start date,
  period_end date,
  created_by uuid references auth.users(id),
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.instructor_earnings (
  id uuid primary key default gen_random_uuid(),
  instructor_id uuid not null references public.instructors(id) on delete restrict,
  order_id uuid not null references public.orders(id) on delete cascade,
  order_item_id uuid not null references public.order_items(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete restrict,
  currency char(3) not null,
  net_revenue_minor bigint not null,        -- item revenue excl. tax, after discount
  share_pct numeric(5,2) not null,
  amount_minor bigint not null,
  status public.earning_status not null default 'pending',
  available_at timestamptz,                 -- after refund window
  payout_id uuid references public.payouts(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (order_item_id, instructor_id, course_id)
);
create index on public.instructor_earnings (instructor_id, status);

create table public.affiliate_commissions (
  id uuid primary key default gen_random_uuid(),
  affiliate_id uuid not null references public.affiliates(id) on delete restrict,
  order_id uuid not null references public.orders(id) on delete cascade,
  tier smallint not null default 1 check (tier in (1, 2)),   -- 1 = direct referral, 2 = override from a sub-IB's sale
  currency char(3) not null,
  net_revenue_minor bigint not null,
  commission_pct numeric(5,2) not null,
  amount_minor bigint not null,
  status public.earning_status not null default 'pending',
  available_at timestamptz,
  payout_id uuid references public.payouts(id) on delete set null,
  created_at timestamptz not null default now()
);
create index on public.affiliate_commissions (affiliate_id, status);
create unique index on public.affiliate_commissions (order_id, affiliate_id);

-- links that need both tables to exist
alter table public.profiles add constraint profiles_referred_by_fk
  foreign key (referred_by_affiliate_id) references public.affiliates(id) on delete set null;
alter table public.coupons add column affiliate_id uuid references public.affiliates(id) on delete set null; -- IB's own discount code

-- ---------- Organizations (B2B: corporate / university / custom) ----------
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type public.org_type not null default 'corporate',
  seats_total int not null default 0,
  sso_domain text,
  created_at timestamptz not null default now()
);
create table public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'learner' check (role in ('manager','learner')),
  primary key (organization_id, user_id)
);
create table public.organization_courses (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  primary key (organization_id, course_id)
);
alter table public.enrollments add constraint enrollments_org_fk foreign key (organization_id) references public.organizations(id) on delete set null;

-- ---------- Leads & audit ----------
create table public.contact_requests (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email citext not null,
  organization text,
  program_type text,          -- corporate / university / custom / general
  message text,
  created_at timestamptz not null default now()
);

create table public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity text not null,
  entity_id text,
  data jsonb,
  created_at timestamptz not null default now()
);
