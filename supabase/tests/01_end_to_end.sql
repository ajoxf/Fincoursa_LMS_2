-- End-to-end check of purchase -> enrolment -> progress -> certificate -> earnings -> reports -> refund, plus RLS.
-- Run after 00_supabase_stubs.sql, the migrations and seed.sql. Fails loudly on any broken assertion.
\set ON_ERROR_STOP 1

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'admin@test',  '{"full_name":"Admin"}'),
  ('00000000-0000-0000-0000-00000000000b', 'buyer@test',  '{"full_name":"Bea Buyer"}'),
  ('00000000-0000-0000-0000-00000000000c', 'tom@test',    '{"full_name":"Tom Robson"}'),
  ('00000000-0000-0000-0000-00000000000d', 'aff@test',    '{"full_name":"Ali Affiliate"}'),
  ('00000000-0000-0000-0000-00000000000e', 'other@test',  '{"full_name":"Other"}');

insert into public.user_roles values ('00000000-0000-0000-0000-00000000000a', 'admin', now()),
                                     ('00000000-0000-0000-0000-00000000000c', 'instructor', now()),
                                     ('00000000-0000-0000-0000-00000000000d', 'affiliate', now());
update public.instructors set user_id = '00000000-0000-0000-0000-00000000000c', default_revenue_share_pct = 50 where slug = 'tom-robson';
insert into public.affiliates (user_id, code, status, commission_pct) values ('00000000-0000-0000-0000-00000000000d', 'ALI', 'approved', 20);

-- Video for the TA course intro lesson: 600s
insert into public.video_assets (id, asset_id, playback_id, status, duration_seconds)
values ('00000000-0000-0000-0000-0000000000f1', 'asset1', 'pb1', 'ready', 600);
update public.lessons set video_asset_id = '00000000-0000-0000-0000-0000000000f1', is_preview = false
 where course_id = (select id from public.courses where slug = 'technical-analysis-theory-and-history');

-- Affiliate click
select public.track_affiliate_click('ALI', 'visitor-1', '/courses/x', 'https://twitter.com', 'ae');

-- Order: TA course, AED 367.00 incl. 5% VAT, referred by ALI
insert into public.orders (id, user_id, currency, subtotal_minor, tax_minor, total_minor, tax_rate, billing_country, affiliate_id, gateway)
values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000b', 'AED', 36700, 1748, 36700, 0.05, 'AE',
        (select id from public.affiliates where code = 'ALI'), 'manual');
insert into public.order_items (order_id, course_id, title, unit_amount_minor)
select '00000000-0000-0000-0000-0000000000a1', id, title, 36700 from public.courses where slug = 'technical-analysis-theory-and-history';

do $$ begin
  assert public.fulfill_order('00000000-0000-0000-0000-0000000000a1', 'ref-1') = true, 'first fulfil returns true';
  assert public.fulfill_order('00000000-0000-0000-0000-0000000000a1', 'ref-1') = false, 'second fulfil is a no-op';
  assert (select count(*) from public.enrollments where user_id = '00000000-0000-0000-0000-00000000000b') = 1, 'one enrolment';
  -- net ex VAT = 36700/1.05 = 34952; 50% = 17476
  assert (select amount_minor from public.instructor_earnings) = 17476, 'instructor earning 17476';
  -- commission on total - tax = 34952 * 20% = 6990
  assert (select amount_minor from public.affiliate_commissions) = 6990, 'affiliate commission 6990';
end $$;

-- ---- As the buyer (authenticated, RLS on) ----
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);

do $$ declare v_lesson uuid; r record; i int; begin
  assert (select count(*) from public.orders) = 1, 'buyer sees own order only';
  select id into v_lesson from public.lessons where course_id = (select id from public.courses where slug = 'technical-analysis-theory-and-history');
  -- 20 heartbeats of 30s = 600s; the 50s claim is capped at 30
  for i in 1..19 loop perform public.record_video_progress(v_lesson, i*30, 30); end loop;
  select * into r from public.record_video_progress(v_lesson, 600, 50);
  assert r.completed, 'lesson completes at >=90% watched';
  assert r.progress_pct = 100, 'course progress 100';
  assert (select count(*) from public.certificates) = 1, 'certificate issued';
  begin
    perform public.fulfill_order('00000000-0000-0000-0000-0000000000a1', null);
    assert false, 'buyer must not call fulfill_order';
  exception when insufficient_privilege then null; end;
end $$;

-- ---- Another user cannot see the buyer's data or locked content ----
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000e', false);
do $$ begin
  assert (select count(*) from public.orders) = 0, 'other user sees no orders';
  assert (select count(*) from public.enrollments) = 0, 'other user sees no enrolments';
  begin
    perform public.record_video_progress((select id from public.lessons where course_id = (select id from public.courses where slug='technical-analysis-theory-and-history')), 10, 10);
    assert false, 'non-enrolled progress must fail';
  exception when raise_exception then null; end;
  begin perform public.admin_kpis(now() - interval '1 day', now() + interval '1 day'); assert false, 'kpis forbidden';
  exception when raise_exception then null; end;
end $$;

-- ---- Instructor ----
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', false);
do $$ declare s jsonb; p jsonb; begin
  s := public.instructor_summary('AED');
  assert (s->>'pending_minor')::bigint = 17476, 'instructor pending earnings';
  p := public.course_progress_report((select id from public.courses where slug = 'technical-analysis-theory-and-history'));
  assert (p->>'completion_rate')::numeric = 100, 'instructor sees completion rate';
  assert (select count(*) from public.instructor_earnings) = 1, 'instructor sees own earnings';
  begin perform public.course_progress_report((select id from public.courses where slug = 'commodities-market-analysis'));
    assert false, 'not their course'; exception when raise_exception then null; end;
end $$;

-- ---- Affiliate ----
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000d', false);
do $$ declare s jsonb; begin
  s := public.affiliate_summary(30);
  assert (s->>'clicks')::int = 1 and (s->>'conversions')::int = 1 and (s->>'pending_minor')::bigint = 6990, 'affiliate summary ' || s::text;
end $$;

-- ---- Admin ----
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
do $$ declare k jsonb; begin
  k := public.admin_kpis(now() - interval '1 day', now() + interval '1 day', 'AED');
  assert (k->>'gross_minor')::bigint = 36700 and (k->>'net_minor')::bigint = 34952, 'admin kpis ' || k::text;
  assert (select count(*) from public.admin_revenue_series(now() - interval '6 days', now() + interval '1 day', 'AED')) >= 7, 'series';
  assert (select net_minor from public.admin_revenue_breakdown('channel', now() - interval '1 day', now() + interval '1 day', 'AED') where label = 'Affiliate') = 34952, 'channel breakdown';
end $$;

-- ---- Refund (service side) ----
reset role;
do $$ begin
  assert public.apply_refund('00000000-0000-0000-0000-0000000000a1', 36700, 'test', 're_1') = 'refunded', 'full refund';
  assert (select revoked_at is not null from public.enrollments where order_id = '00000000-0000-0000-0000-0000000000a1'), 'access revoked';
  assert (select status from public.instructor_earnings) = 'reversed', 'earning reversed';
  assert (select status from public.affiliate_commissions) = 'reversed', 'commission reversed';
  assert public.apply_refund('00000000-0000-0000-0000-0000000000a1', 1, 'dup', 're_1') = 'refunded', 'duplicate refund webhook ignored';
end $$;

select 'ALL CHECKS PASSED' as result;
