-- Admin student directory, course announcements and email campaigns.
-- Everything here is read and written by the server only (RLS on, no client policies).

-- ---------- Student directory ----------
create or replace view public.admin_students as
select
  p.id,
  p.email,
  p.full_name,
  p.country_code,
  p.marketing_opt_in,
  p.created_at,
  u.last_sign_in_at,
  (select max(e.last_activity_at) from public.enrollments e where e.user_id = p.id) as last_activity_at,
  (select count(*) from public.enrollments e where e.user_id = p.id and e.revoked_at is null
     and (e.expires_at is null or e.expires_at > now())) as active_courses,
  (select count(*) from public.enrollments e where e.user_id = p.id and e.completed_at is not null) as completed_courses,
  (select count(*) from public.orders o where o.user_id = p.id and o.status in ('paid','partially_refunded','refunded') and o.total_minor > 0) as paid_orders,
  (select array_agg(r.role::text) from public.user_roles r where r.user_id = p.id) as roles
from public.profiles p
left join auth.users u on u.id = p.id;

revoke all on public.admin_students from anon, authenticated;

-- ---------- Course announcements ----------
create table if not exists public.course_announcements (
  id          uuid primary key default gen_random_uuid(),
  course_id   uuid not null references public.courses(id) on delete cascade,
  title       text not null,
  body        text not null,
  campaign_id uuid,                      -- set when it was also emailed
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists course_announcements_course_idx on public.course_announcements (course_id, created_at desc);
alter table public.course_announcements enable row level security;
revoke all on public.course_announcements from anon, authenticated;

-- ---------- Email campaigns ----------
create table if not exists public.email_campaigns (
  id           uuid primary key default gen_random_uuid(),
  kind         text not null check (kind in ('promotion','update','announcement')),
  subject      text not null,
  heading      text not null,
  body         text not null,
  cta_label    text,
  cta_url      text,
  audience     jsonb not null default '{}',  -- { courses: uuid[], countries: text[], buyers_only: bool }
  status       text not null default 'draft' check (status in ('draft','scheduled','sending','sent','cancelled')),
  scheduled_for timestamptz,
  total        int not null default 0,
  sent         int not null default 0,
  failed       int not null default 0,
  skipped      int not null default 0,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  started_at   timestamptz,
  finished_at  timestamptz
);
alter table public.email_campaigns enable row level security;
revoke all on public.email_campaigns from anon, authenticated;

create table if not exists public.email_campaign_recipients (
  campaign_id uuid not null references public.email_campaigns(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  email       text not null,
  name        text,
  status      text not null default 'pending' check (status in ('pending','sent','failed','skipped')),
  error       text,
  sent_at     timestamptz,
  primary key (campaign_id, user_id)
);
create index if not exists email_campaign_recipients_pending_idx on public.email_campaign_recipients (campaign_id) where status = 'pending';
alter table public.email_campaign_recipients enable row level security;
revoke all on public.email_campaign_recipients from anon, authenticated;

-- Search the student directory (server only). Total count comes back on every row.
create or replace function public.admin_student_search(
  p_q text default null, p_course uuid default null, p_country text default null,
  p_consent boolean default null, p_sort text default 'new', p_limit int default 50, p_offset int default 0)
returns table (
  id uuid, email text, full_name text, country_code text, marketing_opt_in boolean, created_at timestamptz,
  last_sign_in_at timestamptz, last_activity_at timestamptz, active_courses bigint, completed_courses bigint,
  paid_orders bigint, roles text[], total bigint)
language sql stable security definer set search_path = public as $$
  select s.id, s.email::text, s.full_name, s.country_code::text, s.marketing_opt_in, s.created_at,
         s.last_sign_in_at, s.last_activity_at, s.active_courses, s.completed_courses, s.paid_orders, s.roles,
         count(*) over () as total
  from public.admin_students s
  where (p_q is null or s.email ilike '%' || p_q || '%' or s.full_name ilike '%' || p_q || '%')
    and (p_course is null or exists (select 1 from public.enrollments e where e.user_id = s.id and e.course_id = p_course and e.revoked_at is null))
    and (p_country is null or s.country_code = p_country)
    and (p_consent is null or s.marketing_opt_in = p_consent)
  order by
    case when p_sort = 'name' then lower(coalesce(s.full_name, s.email::text)) end asc,
    case when p_sort = 'active' then s.last_activity_at end desc nulls last,
    s.created_at desc
  limit greatest(1, least(p_limit, 100000)) offset greatest(0, p_offset);
$$;
revoke all on function public.admin_student_search(text, uuid, text, boolean, text, int, int) from public, anon, authenticated;
grant execute on function public.admin_student_search(text, uuid, text, boolean, text, int, int) to service_role;

-- Who an email reaches. Promotions only go to people who agreed to marketing emails.
create or replace function public.campaign_audience(
  p_kind text, p_courses uuid[] default null, p_countries text[] default null, p_buyers_only boolean default false)
returns table (user_id uuid, email text, full_name text)
language sql stable security definer set search_path = public as $$
  select p.id, p.email::text, p.full_name
  from public.profiles p
  where p.email is not null
    and (p_kind <> 'promotion' or p.marketing_opt_in)
    and (coalesce(cardinality(p_countries), 0) = 0 or p.country_code = any (p_countries))
    and (coalesce(cardinality(p_courses), 0) = 0 or exists (
          select 1 from public.enrollments e where e.user_id = p.id and e.course_id = any (p_courses)
            and e.revoked_at is null and (e.expires_at is null or e.expires_at > now())))
    and (not coalesce(p_buyers_only, false) or exists (
          select 1 from public.orders o where o.user_id = p.id and o.status in ('paid','partially_refunded') and o.total_minor > 0));
$$;

-- Freeze the recipient list for a campaign (so people who sign up mid-send don't change it). Returns the count.
create or replace function public.enqueue_campaign(p_campaign uuid) returns int
language plpgsql security definer set search_path = public as $$
declare v_c public.email_campaigns; v_n int;
begin
  select * into v_c from public.email_campaigns where id = p_campaign for update;
  if not found then raise exception 'campaign not found'; end if;
  insert into public.email_campaign_recipients (campaign_id, user_id, email, name)
  select p_campaign, a.user_id, a.email, a.full_name
  from public.campaign_audience(
    v_c.kind,
    (select array_agg(x::uuid) from jsonb_array_elements_text(coalesce(v_c.audience->'courses', '[]')) x),
    (select array_agg(x) from jsonb_array_elements_text(coalesce(v_c.audience->'countries', '[]')) x),
    coalesce((v_c.audience->>'buyers_only')::boolean, false)) a
  on conflict do nothing;
  select count(*) into v_n from public.email_campaign_recipients where campaign_id = p_campaign;
  update public.email_campaigns set total = v_n where id = p_campaign;
  return v_n;
end $$;

revoke all on function public.campaign_audience(text, uuid[], text[], boolean) from public, anon, authenticated;
revoke all on function public.enqueue_campaign(uuid) from public, anon, authenticated;
grant execute on function public.campaign_audience(text, uuid[], text[], boolean) to service_role;
grant execute on function public.enqueue_campaign(uuid) to service_role;

do $$ begin
  alter table public.course_announcements
    add constraint course_announcements_campaign_fk foreign key (campaign_id) references public.email_campaigns(id) on delete set null;
exception when duplicate_object then null; end $$;
