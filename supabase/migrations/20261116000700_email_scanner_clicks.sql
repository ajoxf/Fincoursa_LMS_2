-- Company email security scanners open every link in an email within a second or two, before (or instead of)
-- the person. A click counts as a person's click only if the same recipient didn't also open a different link
-- within 5 seconds of it; the rest are shown separately as "link checks".
drop function if exists public.campaign_funnel(uuid[]);
drop function if exists public.campaign_recipient_journey(uuid);

create or replace function public.campaign_recipient_journey(p_campaign uuid)
returns table (email text, name text, is_contact boolean, status text, opened_at timestamptz, clicked_at timestamptz, opens int, clicks int,
               signed_up_at timestamptz, sample_at timestamptz, bought_at timestamptz, orders int, revenue_minor bigint, currency text,
               scanner_clicks int)
language sql stable security definer set search_path = public as $$
  with c as (select id, coalesce(started_at, created_at) as t0 from public.email_campaigns where id = p_campaign),
  r as (
    select rc.*, p.id as uid, p.created_at as profile_created
    from public.email_campaign_recipients rc
    left join public.profiles p on p.id = rc.user_id or (rc.user_id is null and lower(p.email) = lower(rc.email))
    where rc.campaign_id = p_campaign
  ),
  clicks as (
    select e.recipient_id, e.created_at,
      exists (select 1 from public.email_events o where o.recipient_id = e.recipient_id and o.kind = 'click' and o.id <> e.id
                and o.url is distinct from e.url and abs(extract(epoch from o.created_at - e.created_at)) <= 5) as scanner
    from public.email_events e where e.campaign_id = p_campaign and e.kind = 'click'
  ),
  k as (
    select recipient_id, min(created_at) filter (where not scanner) as first_human, count(*) filter (where not scanner) as human,
           count(*) filter (where scanner) as scanned
    from clicks group by recipient_id
  )
  select r.email, r.name, r.contact_id is not null, r.status,
    -- an open from a scanner burst alone isn't trusted: keep the open time only if they opened, or clicked for real
    case when r.opens > 0 or k.first_human is not null then coalesce(r.opened_at, k.first_human) end,
    k.first_human, r.opens, coalesce(k.human, 0)::int,
    case when r.profile_created >= c.t0 and r.profile_created < c.t0 + interval '30 days' then r.profile_created end,
    (select min(qa.created_at) from public.quiz_attempts qa join public.lessons l on l.id = qa.lesson_id
      where qa.user_id = r.uid and l.is_preview and qa.created_at >= c.t0 and qa.created_at < c.t0 + interval '30 days'),
    o.first_paid, coalesce(o.n, 0)::int, coalesce(o.revenue, 0)::bigint, o.currency,
    coalesce(k.scanned, 0)::int
  from r cross join c
  left join k on k.recipient_id = r.id
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

create or replace function public.campaign_funnel(p_ids uuid[])
returns table (campaign_id uuid, opened int, clicked int, signed_up int, sampled int, bought int, revenue_minor bigint,
               scanned int, tracked boolean)
language sql stable security definer set search_path = public as $$
  select id, count(*) filter (where j.opened_at is not null)::int, count(*) filter (where j.clicked_at is not null)::int,
         count(*) filter (where j.signed_up_at is not null)::int, count(*) filter (where j.sample_at is not null)::int,
         count(*) filter (where j.orders > 0)::int, coalesce(sum(j.revenue_minor), 0)::bigint,
         count(*) filter (where j.scanner_clicks > 0)::int,
         -- per-person tracking went live 16 Nov 2026 04:57 UTC; earlier emails have no opens or clicks per person
         -- (the admin page decides this itself from the email's creation time, so this column is informational)
         (select coalesce(started_at, created_at) >= '2026-11-16T05:00:00Z' from public.email_campaigns where email_campaigns.id = x.id)
  from unnest(p_ids) as x(id) cross join lateral public.campaign_recipient_journey(x.id) j
  group by x.id;
$$;
revoke all on function public.campaign_funnel(uuid[]) from public, anon, authenticated;
grant execute on function public.campaign_funnel(uuid[]) to service_role;
