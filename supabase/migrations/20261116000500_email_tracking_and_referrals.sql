-- 1) Email tracking per person: opens (a tiny image) and clicks (links go through fincoursa.com/api/e/c first).
alter table public.email_campaign_recipients
  add column if not exists opened_at timestamptz,
  add column if not exists clicked_at timestamptz,
  add column if not exists opens int not null default 0,
  add column if not exists clicks int not null default 0;

create table if not exists public.email_events (
  id bigint generated always as identity primary key,
  recipient_id bigint not null references public.email_campaign_recipients(id) on delete cascade,
  campaign_id uuid not null references public.email_campaigns(id) on delete cascade,
  kind text not null check (kind in ('open', 'click')),
  url text,
  user_agent text,
  created_at timestamptz not null default now()
);
create index if not exists email_events_campaign on public.email_events (campaign_id, kind);
create index if not exists email_events_recipient on public.email_events (recipient_id);
alter table public.email_events enable row level security;
revoke all on public.email_events from anon, authenticated;

create or replace function public.record_email_event(p_recipient bigint, p_kind text, p_url text, p_agent text)
returns void language plpgsql security definer set search_path = public as $$
declare v_campaign uuid;
begin
  select campaign_id into v_campaign from public.email_campaign_recipients where id = p_recipient;
  if not found then return; end if;
  insert into public.email_events (recipient_id, campaign_id, kind, url, user_agent) values (p_recipient, v_campaign, p_kind, left(p_url, 1000), left(p_agent, 300));
  if p_kind = 'open' then
    update public.email_campaign_recipients set opens = opens + 1, opened_at = coalesce(opened_at, now()) where id = p_recipient;
  else
    -- a click also proves the email was opened (images may have been blocked)
    update public.email_campaign_recipients set clicks = clicks + 1, clicked_at = coalesce(clicked_at, now()), opened_at = coalesce(opened_at, now()) where id = p_recipient;
  end if;
end $$;
revoke all on function public.record_email_event(bigint, text, text, text) from public, anon, authenticated;
grant execute on function public.record_email_event(bigint, text, text, text) to service_role;

-- Each person's journey after an email: opened, clicked, then (within 30 days of sending) signed up,
-- took a free sample quiz, bought (paid orders, before tax, less refunds).
create or replace function public.campaign_recipient_journey(p_campaign uuid)
returns table (email text, name text, is_contact boolean, status text, opened_at timestamptz, clicked_at timestamptz, opens int, clicks int,
               signed_up_at timestamptz, sample_at timestamptz, bought_at timestamptz, orders int, revenue_minor bigint, currency text)
language sql stable security definer set search_path = public as $$
  with c as (select id, coalesce(started_at, created_at) as t0 from public.email_campaigns where id = p_campaign),
  r as (
    select rc.*, p.id as uid, p.created_at as profile_created
    from public.email_campaign_recipients rc
    left join public.profiles p on p.id = rc.user_id or (rc.user_id is null and lower(p.email) = lower(rc.email))
    where rc.campaign_id = p_campaign
  )
  select r.email, r.name, r.contact_id is not null, r.status, r.opened_at, r.clicked_at, r.opens, r.clicks,
    case when r.profile_created >= c.t0 and r.profile_created < c.t0 + interval '30 days' then r.profile_created end,
    (select min(qa.created_at) from public.quiz_attempts qa join public.lessons l on l.id = qa.lesson_id
      where qa.user_id = r.uid and l.is_preview and qa.created_at >= c.t0 and qa.created_at < c.t0 + interval '30 days'),
    o.first_paid, coalesce(o.n, 0)::int, coalesce(o.revenue, 0)::bigint, o.currency
  from r cross join c
  left join lateral (
    select min(coalesce(x.paid_at, x.created_at)) as first_paid, count(*) as n,
           sum(x.total_minor - x.tax_minor - x.refunded_minor) as revenue, min(x.currency) as currency
    from public.orders x
    where x.user_id = r.uid and x.status in ('paid', 'partially_refunded') and x.total_minor > 0
      and coalesce(x.paid_at, x.created_at) >= c.t0 and coalesce(x.paid_at, x.created_at) < c.t0 + interval '30 days'
  ) o on true
  order by coalesce(r.name, r.email);
$$;
revoke all on function public.campaign_recipient_journey(uuid) from public, anon, authenticated;
grant execute on function public.campaign_recipient_journey(uuid) to service_role;

-- Totals for the history list
create or replace function public.campaign_funnel(p_ids uuid[])
returns table (campaign_id uuid, opened int, clicked int, signed_up int, sampled int, bought int, revenue_minor bigint)
language sql stable security definer set search_path = public as $$
  select id, count(*) filter (where j.opened_at is not null)::int, count(*) filter (where j.clicked_at is not null)::int,
         count(*) filter (where j.signed_up_at is not null)::int, count(*) filter (where j.sample_at is not null)::int,
         count(*) filter (where j.orders > 0)::int, coalesce(sum(j.revenue_minor), 0)::bigint
  from unnest(p_ids) as id cross join lateral public.campaign_recipient_journey(id) j
  group by id;
$$;
revoke all on function public.campaign_funnel(uuid[]) from public, anon, authenticated;
grant execute on function public.campaign_funnel(uuid[]) to service_role;

-- 2) Refer a friend: everyone can share a personal link (fincoursa.com/r/CODE). When a friend buys,
--    the person who shared it gets a % of what the friend paid (before tax) as FinCoursa credit.
alter table public.profiles add column if not exists referral_code text;
create unique index if not exists profiles_referral_code_key on public.profiles (lower(referral_code)) where referral_code is not null;

alter table public.orders
  add column if not exists referred_by uuid references public.profiles(id) on delete set null,
  add column if not exists referral_minor bigint not null default 0 check (referral_minor >= 0),
  add column if not exists referral_valid_days int check (referral_valid_days is null or referral_valid_days > 0);

alter table public.credit_grants drop constraint if exists credit_grants_source_check;
alter table public.credit_grants add constraint credit_grants_source_check check (source in ('cashback', 'manual', 'referral'));
create unique index if not exists credit_grants_one_referral_per_order on public.credit_grants(order_id) where source = 'referral';

create or replace function public.orders_referral_on_status()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.referred_by is null or new.referral_minor <= 0 or new.referred_by = new.user_id then return null; end if;
  if new.status = 'paid' and old.status is distinct from 'paid' then
    insert into public.credit_grants (user_id, currency, amount_minor, remaining_minor, source, order_id, note, expires_at)
    values (new.referred_by, new.currency, new.referral_minor, new.referral_minor, 'referral', new.id,
            'Referral: a friend bought (order #' || new.number || ')',
            case when new.referral_valid_days is null then null else now() + make_interval(days => new.referral_valid_days) end)
    on conflict do nothing;
  elsif new.status = 'refunded' and old.status is distinct from 'refunded' then
    update public.credit_grants set remaining_minor = 0, revoked_at = now()
     where order_id = new.id and source = 'referral' and revoked_at is null;
  end if;
  return null;
end $$;
drop trigger if exists orders_referral_on_status on public.orders;
create trigger orders_referral_on_status after update of status on public.orders
  for each row execute function public.orders_referral_on_status();

insert into public.site_settings (key, value) values ('referral', '{"enabled": true, "percent": 10}'::jsonb)
on conflict (key) do nothing;
