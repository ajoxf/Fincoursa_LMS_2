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

-- ---------- Affiliate ----------
create or replace function public.affiliate_summary(p_days int default 30)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_aff public.affiliates; v_from timestamptz := now() - make_interval(days => p_days); r jsonb;
begin
  select * into v_aff from public.affiliates where user_id = auth.uid();
  if v_aff.id is null then raise exception 'not an affiliate'; end if;

  select jsonb_build_object(
    'code', v_aff.code, 'status', v_aff.status, 'commission_pct', v_aff.commission_pct, 'cookie_days', v_aff.cookie_days,
    'clicks', (select count(*) from public.affiliate_clicks where affiliate_id = v_aff.id and created_at >= v_from),
    'unique_visitors', (select count(distinct visitor_id) from public.affiliate_clicks where affiliate_id = v_aff.id and created_at >= v_from),
    'conversions', (select count(*) from public.orders where affiliate_id = v_aff.id and status in ('paid','partially_refunded') and paid_at >= v_from),
    'referred_revenue_minor', (select coalesce(sum(net_revenue_minor),0) from public.affiliate_commissions where affiliate_id = v_aff.id and status <> 'reversed' and created_at >= v_from),
    'pending_minor',  (select coalesce(sum(amount_minor),0) from public.affiliate_commissions where affiliate_id = v_aff.id and status = 'pending'),
    'approved_minor', (select coalesce(sum(amount_minor),0) from public.affiliate_commissions where affiliate_id = v_aff.id and status = 'approved'),
    'paid_minor',     (select coalesce(sum(amount_minor),0) from public.affiliate_commissions where affiliate_id = v_aff.id and status = 'paid'),
    'series', coalesce((
      select jsonb_agg(jsonb_build_object('day', d::date,
        'clicks', (select count(*) from public.affiliate_clicks c where c.affiliate_id = v_aff.id and date_trunc('day', c.created_at) = d),
        'conversions', (select count(*) from public.affiliate_commissions ac where ac.affiliate_id = v_aff.id and ac.status <> 'reversed' and date_trunc('day', ac.created_at) = d),
        'commission_minor', (select coalesce(sum(amount_minor),0) from public.affiliate_commissions ac where ac.affiliate_id = v_aff.id and ac.status <> 'reversed' and date_trunc('day', ac.created_at) = d)
      ) order by d)
      from generate_series(date_trunc('day', v_from), date_trunc('day', now()), interval '1 day') d), '[]'::jsonb)
  ) into r;
  return r;
end $$;

-- Record a click from the referral link (called server-side; anyone may call, validated by code)
create or replace function public.track_affiliate_click(p_code text, p_visitor text, p_path text, p_referrer text, p_country text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  select id into v_id from public.affiliates where code = p_code and status = 'approved';
  if v_id is null then return null; end if;
  insert into public.affiliate_clicks (affiliate_id, visitor_id, landing_path, referrer, country_code)
  values (v_id, left(p_visitor, 64), left(p_path, 500), left(p_referrer, 500), upper(left(p_country, 2)));
  return v_id;
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
