-- =====================================================================
-- Revenue & progress reporting for every role.
-- All functions check the caller's role; none expose personal data
-- beyond what that role is allowed to see.
-- =====================================================================

-- Net revenue of an order line, excluding tax and after refunds (pro-rata)
create or replace view public.v_order_lines
with (security_invoker = true) as
select
  oi.id as order_item_id, o.id as order_id, o.user_id, o.paid_at, o.currency, o.billing_country,
  o.gateway, o.affiliate_id, o.status, oi.course_id, oi.bundle_id, oi.title,
  (oi.unit_amount_minor * oi.quantity - oi.discount_minor) as gross_minor,
  round(
    (oi.unit_amount_minor * oi.quantity - oi.discount_minor)
    * (1 - o.refunded_minor::numeric / nullif(o.total_minor, 0))
    / case when o.tax_rate > 0 and coalesce(t.prices_include_tax, true) then 1 + o.tax_rate else 1 end
  ) as net_minor
from public.order_items oi
join public.orders o on o.id = oi.order_id
left join public.tax_rates t on t.country_code = o.billing_country
where o.status in ('paid','partially_refunded','refunded');

-- ---------- Admin / finance ----------
create or replace function public.admin_kpis(p_from timestamptz, p_to timestamptz, p_currency char(3) default 'AED')
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare r jsonb;
begin
  if not (public.has_role('admin') or public.has_role('finance')) then raise exception 'forbidden'; end if;
  select jsonb_build_object(
    'gross_minor',    coalesce(sum(total_minor), 0),
    'tax_minor',      coalesce(sum(tax_minor), 0),
    'refunds_minor',  coalesce(sum(refunded_minor), 0),
    'net_minor',      coalesce(sum(total_minor - tax_minor - refunded_minor), 0),
    'orders',         count(*),
    'aov_minor',      coalesce(round(avg(total_minor)), 0),
    'buyers',         count(distinct user_id),
    'affiliate_orders', count(*) filter (where affiliate_id is not null)
  ) into r
  from public.orders
  where status in ('paid','partially_refunded','refunded') and currency = p_currency
    and paid_at >= p_from and paid_at < p_to;

  r := r || jsonb_build_object(
    'new_students', (select count(*) from public.profiles where created_at >= p_from and created_at < p_to),
    'enrollments',  (select count(*) from public.enrollments where enrolled_at >= p_from and enrolled_at < p_to),
    'completions',  (select count(*) from public.enrollments where completed_at >= p_from and completed_at < p_to),
    'instructor_payable_minor', (select coalesce(sum(amount_minor),0) from public.instructor_earnings where status = 'approved' and currency = p_currency),
    'affiliate_payable_minor',  (select coalesce(sum(amount_minor),0) from public.affiliate_commissions where status = 'approved' and currency = p_currency)
  );
  return r;
end $$;

create or replace function public.admin_revenue_series(p_from timestamptz, p_to timestamptz, p_currency char(3) default 'AED')
returns table (day date, gross_minor bigint, net_minor bigint, refunds_minor bigint, orders bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.has_role('admin') or public.has_role('finance')) then raise exception 'forbidden'; end if;
  return query
  select d::date,
         coalesce(sum(o.total_minor), 0)::bigint,
         coalesce(sum(o.total_minor - o.tax_minor - o.refunded_minor), 0)::bigint,
         coalesce(sum(o.refunded_minor), 0)::bigint,
         count(o.id)
    from generate_series(date_trunc('day', p_from), date_trunc('day', p_to - interval '1 second'), interval '1 day') d
    left join public.orders o
      on date_trunc('day', o.paid_at) = d and o.currency = p_currency
     and o.status in ('paid','partially_refunded','refunded')
   group by d order by d;
end $$;

-- Revenue breakdown by: course | gateway | country | channel (affiliate vs direct)
create or replace function public.admin_revenue_breakdown(p_dimension text, p_from timestamptz, p_to timestamptz, p_currency char(3) default 'AED')
returns table (label text, net_minor bigint, orders bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.has_role('admin') or public.has_role('finance')) then raise exception 'forbidden'; end if;
  return query
  select case p_dimension
           when 'course'  then l.title
           when 'gateway' then coalesce(l.gateway, 'unknown')
           when 'country' then coalesce(l.billing_country, '—')
           when 'channel' then case when l.affiliate_id is null then 'Direct' else 'Affiliate' end
         end as label,
         sum(l.net_minor)::bigint, count(distinct l.order_id)
    from public.v_order_lines l
   where l.currency = p_currency and l.paid_at >= p_from and l.paid_at < p_to
   group by 1 order by 2 desc nulls last;
end $$;

-- ---------- Course progress (instructor of the course, or staff) ----------
create or replace function public.course_progress_report(p_course uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare r jsonb;
begin
  if not (public.is_staff() or public.is_course_instructor(p_course)) then raise exception 'forbidden'; end if;
  select jsonb_build_object(
    'enrolled', count(*),
    'active_7d', count(*) filter (where last_activity_at > now() - interval '7 days'),
    'not_started', count(*) filter (where progress_pct = 0),
    'avg_progress', coalesce(round(avg(progress_pct), 1), 0),
    'completed', count(*) filter (where completed_at is not null),
    'completion_rate', coalesce(round(100.0 * count(*) filter (where completed_at is not null) / nullif(count(*), 0), 1), 0)
  ) into r
  from public.enrollments where course_id = p_course and revoked_at is null;

  -- per-lesson funnel: where do students drop off?
  r := r || jsonb_build_object('lessons', coalesce((
    select jsonb_agg(jsonb_build_object(
             'lesson_id', l.id, 'title', l.title, 'chapter', c.title,
             'started', (select count(*) from public.lesson_progress lp where lp.lesson_id = l.id),
             'completed', (select count(*) from public.lesson_progress lp where lp.lesson_id = l.id and lp.completed_at is not null))
           order by c.position, l.position)
      from public.lessons l join public.chapters c on c.id = l.chapter_id
     where l.course_id = p_course), '[]'::jsonb));
  return r;
end $$;

-- Progress distribution in buckets (0, 1-25, 26-50, 51-75, 76-99, 100)
create or replace function public.course_progress_buckets(p_course uuid)
returns table (bucket text, students bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.is_staff() or public.is_course_instructor(p_course)) then raise exception 'forbidden'; end if;
  return query
  select b.label, count(e.id)
    from (values (1,'0%',0,0),(2,'1–25%',0.01,25),(3,'26–50%',25.01,50),(4,'51–75%',50.01,75),(5,'76–99%',75.01,99.99),(6,'100%',100,100))
         as b(ord,label,lo,hi)
    left join public.enrollments e
      on e.course_id = p_course and e.revoked_at is null and e.progress_pct between b.lo and b.hi
   group by b.ord, b.label order by b.ord;
end $$;

-- ---------- Instructor ----------
create or replace function public.instructor_summary(p_currency char(3) default 'AED')
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_ins uuid; r jsonb;
begin
  select id into v_ins from public.instructors where user_id = auth.uid();
  if v_ins is null then raise exception 'not an instructor'; end if;

  select jsonb_build_object(
    'pending_minor',  coalesce(sum(amount_minor) filter (where status = 'pending'), 0),
    'approved_minor', coalesce(sum(amount_minor) filter (where status = 'approved'), 0),
    'paid_minor',     coalesce(sum(amount_minor) filter (where status = 'paid'), 0),
    'lifetime_minor', coalesce(sum(amount_minor) filter (where status <> 'reversed'), 0),
    'last_30d_minor', coalesce(sum(amount_minor) filter (where status <> 'reversed' and created_at > now() - interval '30 days'), 0)
  ) into r
  from public.instructor_earnings where instructor_id = v_ins and currency = p_currency;

  r := r || jsonb_build_object('courses', coalesce((
    select jsonb_agg(jsonb_build_object(
      'course_id', c.id, 'title', c.title, 'slug', c.slug,
      'students', (select count(*) from public.enrollments e where e.course_id = c.id and e.revoked_at is null),
      'avg_progress', (select coalesce(round(avg(progress_pct),1),0) from public.enrollments e where e.course_id = c.id and e.revoked_at is null),
      'completions', (select count(*) from public.enrollments e where e.course_id = c.id and e.completed_at is not null),
      'earnings_minor', (select coalesce(sum(amount_minor),0) from public.instructor_earnings ie
                          where ie.course_id = c.id and ie.instructor_id = v_ins and ie.status <> 'reversed' and ie.currency = p_currency)
    ) order by c.title)
    from public.courses c join public.course_instructors ci on ci.course_id = c.id
   where ci.instructor_id = v_ins), '[]'::jsonb));
  return r;
end $$;

create or replace function public.instructor_earnings_series(p_days int default 90, p_currency char(3) default 'AED')
returns table (day date, amount_minor bigint, sales bigint)
language plpgsql stable security definer set search_path = public as $$
declare v_ins uuid;
begin
  select id into v_ins from public.instructors where user_id = auth.uid();
  if v_ins is null then raise exception 'not an instructor'; end if;
  return query
  select d::date, coalesce(sum(ie.amount_minor), 0)::bigint, count(ie.id)
    from generate_series(date_trunc('day', now() - make_interval(days => p_days - 1)), date_trunc('day', now()), interval '1 day') d
    left join public.instructor_earnings ie
      on ie.instructor_id = v_ins and date_trunc('day', ie.created_at) = d and ie.status <> 'reversed' and ie.currency = p_currency
   group by d order by d;
end $$;

-- ---------- Affiliate / Introducing Broker ----------
-- Clients are shown to their IB with privacy masking: first name + last initial, masked email.
create or replace function public.mask_name(p_name text, p_email text) returns text
language sql immutable as $$
  select case
    when coalesce(trim(p_name), '') = '' then coalesce(left(split_part(p_email, '@', 1), 1), '?') || '•••'
    when position(' ' in trim(p_name)) = 0 then trim(p_name)
    else split_part(trim(p_name), ' ', 1) || ' ' || left(reverse(split_part(reverse(trim(p_name)), ' ', 1)), 1) || '.'
  end;
$$;
create or replace function public.mask_email(p_email text) returns text
language sql immutable as $$
  select case when p_email is null then null
    else left(split_part(p_email, '@', 1), 1) || '•••@' || split_part(p_email, '@', 2) end;
$$;

create or replace function public.current_affiliate() returns public.affiliates
language sql stable security definer set search_path = public as $$
  select * from public.affiliates where user_id = auth.uid();
$$;

-- Record a click from a referral link (called from the proxy with the anon key; validated by code)
create or replace function public.track_affiliate_click(p_code text, p_visitor text, p_path text, p_referrer text, p_country text, p_campaign text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  select id into v_id from public.affiliates where code = p_code and status = 'approved';
  if v_id is null then return null; end if;
  insert into public.affiliate_clicks (affiliate_id, visitor_id, landing_path, referrer, country_code, campaign)
  values (v_id, left(p_visitor, 64), left(p_path, 500), left(p_referrer, 500), nullif(upper(left(trim(p_country), 2)), ''),
          nullif(left(lower(regexp_replace(coalesce(p_campaign, ''), '[^A-Za-z0-9_-]', '', 'g')), 60), ''));
  return v_id;
end $$;

-- First-touch client attribution at sign-up (service role only)
create or replace function public.record_referral_signup(p_user uuid, p_code text) returns void
language sql security definer set search_path = public as $$
  update public.profiles p set referred_by_affiliate_id = a.id, referred_at = now()
    from public.affiliates a
   where p.id = p_user and p.referred_by_affiliate_id is null
     and a.code = p_code and a.status = 'approved' and a.user_id <> p_user;
$$;
revoke all on function public.record_referral_signup(uuid, text) from public, anon, authenticated;

create or replace function public.affiliate_dashboard(p_days int default 30)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  a public.affiliates; v_from timestamptz := date_trunc('day', now()) - make_interval(days => p_days - 1); r jsonb;
begin
  a := public.current_affiliate();
  if a.id is null then raise exception 'not an affiliate'; end if;

  with comm as (
    select ac.*, o.user_id as buyer, o.affiliate_campaign, o.billing_country, o.attribution, o.number
      from public.affiliate_commissions ac join public.orders o on o.id = ac.order_id
     where ac.affiliate_id = a.id and ac.status <> 'reversed'
  ), comm_p as (select * from comm where created_at >= v_from),
  clicks_p as (select * from public.affiliate_clicks where affiliate_id = a.id and created_at >= v_from)
  select jsonb_build_object(
    'profile', jsonb_build_object(
      'code', a.code, 'status', a.status, 'commission_pct', a.commission_pct, 'cookie_days', a.cookie_days,
      'override_pct', a.override_pct,
      'parent_code', (select code from public.affiliates where id = a.parent_affiliate_id),
      'joined', a.approved_at, 'has_payout_details', a.payout_details <> '{}'::jsonb),
    'funnel', jsonb_build_object(
      'clicks', (select count(*) from clicks_p),
      'unique_visitors', (select count(distinct visitor_id) from clicks_p),
      'signups', (select count(*) from public.profiles where referred_by_affiliate_id = a.id and referred_at >= v_from),
      'buyers', (select count(distinct buyer) from comm_p where tier = 1),
      'sales', (select count(*) from comm_p where tier = 1)),
    'money', jsonb_build_object(
      'referred_revenue_minor', (select coalesce(sum(net_revenue_minor), 0) from comm_p where tier = 1),
      'commission_minor', (select coalesce(sum(amount_minor), 0) from comm_p),
      'direct_minor', (select coalesce(sum(amount_minor), 0) from comm_p where tier = 1),
      'override_minor', (select coalesce(sum(amount_minor), 0) from comm_p where tier = 2),
      'pending_minor', (select coalesce(sum(amount_minor), 0) from comm where status = 'pending'),
      'approved_minor', (select coalesce(sum(amount_minor), 0) from comm where status = 'approved'),
      'paid_minor', (select coalesce(sum(amount_minor), 0) from comm where status = 'paid'),
      'lifetime_minor', (select coalesce(sum(amount_minor), 0) from comm),
      'next_release_at', (select min(available_at) from comm where status = 'pending'),
      'next_release_minor', (select coalesce(sum(amount_minor), 0) from comm where status = 'pending'
                              and date_trunc('day', available_at) = (select date_trunc('day', min(available_at)) from comm where status = 'pending'))),
    'series', coalesce((
      select jsonb_agg(jsonb_build_object('day', d::date,
        'clicks', (select count(*) from clicks_p c where date_trunc('day', c.created_at) = d),
        'signups', (select count(*) from public.profiles pr where pr.referred_by_affiliate_id = a.id and date_trunc('day', pr.referred_at) = d),
        'sales', (select count(*) from comm_p x where x.tier = 1 and date_trunc('day', x.created_at) = d),
        'commission_minor', (select coalesce(sum(amount_minor), 0) from comm_p x where date_trunc('day', x.created_at) = d)) order by d)
      from generate_series(v_from, date_trunc('day', now()), interval '1 day') d), '[]'::jsonb),
    'campaigns', coalesce((
      select jsonb_agg(t order by (t->>'commission_minor')::bigint desc, (t->>'clicks')::int desc) from (
        select jsonb_build_object('campaign', k.campaign,
          'clicks', (select count(*) from clicks_p c where coalesce(c.campaign, '(none)') = k.campaign),
          'sales', (select count(*) from comm_p x where x.tier = 1 and coalesce(x.affiliate_campaign, '(none)') = k.campaign),
          'revenue_minor', (select coalesce(sum(net_revenue_minor), 0) from comm_p x where x.tier = 1 and coalesce(x.affiliate_campaign, '(none)') = k.campaign),
          'commission_minor', (select coalesce(sum(amount_minor), 0) from comm_p x where x.tier = 1 and coalesce(x.affiliate_campaign, '(none)') = k.campaign)) t
        from (select coalesce(campaign, '(none)') campaign from clicks_p union select coalesce(affiliate_campaign, '(none)') from comm_p where tier = 1) k) z), '[]'::jsonb),
    'sources', coalesce((
      select jsonb_agg(jsonb_build_object('source', src, 'clicks', n) order by n desc) from (
        select coalesce(nullif(substring(referrer from '^https?://(?:www\.)?([^/:?#]+)'), ''), 'Direct / unknown') src, count(*) n
          from clicks_p group by 1 order by 2 desc limit 8) q), '[]'::jsonb),
    'countries', coalesce((
      select jsonb_agg(jsonb_build_object('country', cc, 'clicks', clicks, 'sales', sales) order by sales desc, clicks desc) from (
        select cc, sum(clicks) clicks, sum(sales) sales from (
          select coalesce(country_code, 'Unknown') cc, count(*) clicks, 0 sales from clicks_p group by 1
          union all select coalesce(billing_country, 'Unknown'), 0, count(*) from comm_p where tier = 1 group by 1) u
        group by cc order by 3 desc, 2 desc limit 8) q), '[]'::jsonb),
    'courses', coalesce((
      select jsonb_agg(jsonb_build_object('title', title, 'sales', sales, 'revenue_minor', rev, 'commission_minor', com) order by rev desc) from (
        select oi.title, count(*) sales,
               sum(x.net_revenue_minor * (oi.unit_amount_minor * oi.quantity - oi.discount_minor)::numeric / nullif(o.subtotal_minor - o.discount_minor, 0))::bigint rev,
               sum(x.amount_minor * (oi.unit_amount_minor * oi.quantity - oi.discount_minor)::numeric / nullif(o.subtotal_minor - o.discount_minor, 0))::bigint com
          from comm_p x join public.orders o on o.id = x.order_id join public.order_items oi on oi.order_id = o.id
         where x.tier = 1 group by oi.title) q), '[]'::jsonb),
    'coupons', coalesce((
      select jsonb_agg(jsonb_build_object('code', c.code, 'percent_off', c.percent_off, 'amount_off_minor', c.amount_off_minor,
        'is_active', c.is_active, 'ends_at', c.ends_at, 'redeemed', c.redeemed_count, 'max_redemptions', c.max_redemptions,
        'sales', (select count(*) from comm x where x.tier = 1 and x.attribution = 'coupon'
                   and exists (select 1 from public.orders o where o.id = x.order_id and o.coupon_id = c.id)),
        'commission_minor', (select coalesce(sum(x.amount_minor), 0) from comm x where x.tier = 1
                   and exists (select 1 from public.orders o where o.id = x.order_id and o.coupon_id = c.id))) order by c.created_at)
      from public.coupons c where c.affiliate_id = a.id), '[]'::jsonb),
    'sub_ibs', coalesce((
      select jsonb_agg(jsonb_build_object('code', s.code, 'name', public.mask_name(p.full_name, p.email::text), 'status', s.status,
        'joined', s.approved_at, 'override_pct', s.override_pct,
        'clicks', (select count(*) from public.affiliate_clicks c where c.affiliate_id = s.id and c.created_at >= v_from),
        'sales', (select count(*) from public.affiliate_commissions x where x.affiliate_id = s.id and x.tier = 1 and x.status <> 'reversed' and x.created_at >= v_from),
        'revenue_minor', (select coalesce(sum(net_revenue_minor), 0) from public.affiliate_commissions x where x.affiliate_id = s.id and x.tier = 1 and x.status <> 'reversed' and x.created_at >= v_from),
        'override_minor', (select coalesce(sum(x.amount_minor), 0) from comm_p x
                            where x.tier = 2 and exists (select 1 from public.orders o where o.id = x.order_id and o.affiliate_id = s.id))
      ) order by s.approved_at nulls last)
      from public.affiliates s join public.profiles p on p.id = s.user_id where s.parent_affiliate_id = a.id), '[]'::jsonb)
  ) into r;
  return r;
end $$;

-- Referred clients: signed up through the IB's link, or bought through it
create or replace function public.affiliate_clients(p_limit int default 200)
returns table (client text, email text, country text, joined_at timestamptz, source text, orders bigint,
               revenue_minor bigint, commission_minor bigint, courses bigint, avg_progress numeric, last_active timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare a public.affiliates;
begin
  a := public.current_affiliate();
  if a.id is null then raise exception 'not an affiliate'; end if;
  return query
  with ids as (
    select p.id from public.profiles p where p.referred_by_affiliate_id = a.id
    union
    select o.user_id from public.affiliate_commissions ac join public.orders o on o.id = ac.order_id
     where ac.affiliate_id = a.id and ac.tier = 1
  )
  select public.mask_name(p.full_name, p.email::text), public.mask_email(p.email::text), p.country_code::text,
         coalesce(p.referred_at, p.created_at),
         case when p.referred_by_affiliate_id = a.id then 'Signed up via your link' else 'Bought via your link' end,
         (select count(*) from public.affiliate_commissions ac join public.orders o on o.id = ac.order_id
           where ac.affiliate_id = a.id and ac.tier = 1 and ac.status <> 'reversed' and o.user_id = p.id),
         (select coalesce(sum(ac.net_revenue_minor), 0) from public.affiliate_commissions ac join public.orders o on o.id = ac.order_id
           where ac.affiliate_id = a.id and ac.tier = 1 and ac.status <> 'reversed' and o.user_id = p.id)::bigint,
         (select coalesce(sum(ac.amount_minor), 0) from public.affiliate_commissions ac join public.orders o on o.id = ac.order_id
           where ac.affiliate_id = a.id and ac.tier = 1 and ac.status <> 'reversed' and o.user_id = p.id)::bigint,
         (select count(*) from public.enrollments e where e.user_id = p.id and e.revoked_at is null),
         (select round(avg(e.progress_pct), 0) from public.enrollments e where e.user_id = p.id and e.revoked_at is null),
         (select max(e.last_activity_at) from public.enrollments e where e.user_id = p.id)
    from ids join public.profiles p on p.id = ids.id
   order by 4 desc
   limit p_limit;
end $$;

-- Commission statement: one row per commission, oldest pending first to show what becomes payable when
create or replace function public.affiliate_statement(p_days int default 90)
returns table (created_at timestamptz, order_number bigint, items text, client text, tier smallint, via text, campaign text,
               sale_minor bigint, pct numeric, amount_minor bigint, currency text, status text, available_at timestamptz, paid_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare a public.affiliates;
begin
  a := public.current_affiliate();
  if a.id is null then raise exception 'not an affiliate'; end if;
  return query
  select ac.created_at, o.number,
         (select string_agg(oi.title, ', ') from public.order_items oi where oi.order_id = o.id),
         case when ac.tier = 1 then (select public.mask_name(p.full_name, p.email::text) from public.profiles p where p.id = o.user_id) else '—' end,
         ac.tier,
         case when ac.tier = 2 then 'Sub-IB ' || (select s.code::text from public.affiliates s where s.id = o.affiliate_id)
              else coalesce(o.attribution, 'link') end,
         o.affiliate_campaign, ac.net_revenue_minor, ac.commission_pct, ac.amount_minor, ac.currency::text, ac.status::text,
         ac.available_at, (select py.paid_at from public.payouts py where py.id = ac.payout_id)
    from public.affiliate_commissions ac join public.orders o on o.id = ac.order_id
   where ac.affiliate_id = a.id and ac.created_at >= now() - make_interval(days => p_days)
   order by ac.created_at desc;
end $$;

-- Admin: per-partner totals computed in the database (no row limits)
create or replace function public.admin_affiliate_stats()
returns table (affiliate_id uuid, clicks bigint, clients bigint, sales bigint, revenue_minor bigint, owed_minor bigint, override_minor bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'forbidden'; end if;
  return query
  select a.id,
    (select count(*) from public.affiliate_clicks c where c.affiliate_id = a.id),
    (select count(*) from public.profiles p where p.referred_by_affiliate_id = a.id),
    (select count(*) from public.affiliate_commissions x where x.affiliate_id = a.id and x.tier = 1 and x.status <> 'reversed'),
    (select coalesce(sum(net_revenue_minor), 0) from public.affiliate_commissions x where x.affiliate_id = a.id and x.tier = 1 and x.status <> 'reversed')::bigint,
    (select coalesce(sum(amount_minor), 0) from public.affiliate_commissions x where x.affiliate_id = a.id and x.status in ('pending','approved'))::bigint,
    (select coalesce(sum(amount_minor), 0) from public.affiliate_commissions x where x.affiliate_id = a.id and x.tier = 2 and x.status <> 'reversed')::bigint
  from public.affiliates a;
end $$;

-- ---------- Organization manager (team / university progress) ----------
create or replace function public.organization_progress(p_org uuid)
returns table (user_id uuid, learner text, course_title text, progress_pct numeric, completed_at timestamptz, last_activity_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.is_staff() or exists (select 1 from public.organization_members m
          where m.organization_id = p_org and m.user_id = auth.uid() and m.role = 'manager')) then
    raise exception 'forbidden';
  end if;
  return query
  select p.id, coalesce(nullif(p.full_name,''), p.email::text), c.title, e.progress_pct, e.completed_at, e.last_activity_at
    from public.organization_members m
    join public.profiles p on p.id = m.user_id
    join public.enrollments e on e.user_id = m.user_id
    join public.courses c on c.id = e.course_id
   where m.organization_id = p_org and m.role = 'learner'
     and (e.organization_id = p_org or e.course_id in (select course_id from public.organization_courses where organization_id = p_org))
   order by 2, 3;
end $$;
