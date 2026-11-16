-- "Bought" now also counts orders that were free with a code (total 0); revenue stays what was actually paid.
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
    where x.user_id = r.uid and x.status in ('paid', 'partially_refunded')
      and coalesce(x.paid_at, x.created_at) >= c.t0 and coalesce(x.paid_at, x.created_at) < c.t0 + interval '30 days'
  ) o on true
  order by coalesce(r.name, r.email);
$$;
revoke all on function public.campaign_recipient_journey(uuid) from public, anon, authenticated;
grant execute on function public.campaign_recipient_journey(uuid) to service_role;
