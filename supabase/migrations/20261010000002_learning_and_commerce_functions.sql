-- =====================================================================
-- Access checks, progress tracking, order fulfilment and refunds
-- =====================================================================

create or replace function public.is_course_instructor(p_course uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from public.course_instructors ci
    join public.instructors i on i.id = ci.instructor_id
    where ci.course_id = p_course and i.user_id = auth.uid());
$$;

create or replace function public.has_course_access(p_course uuid, p_user uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(
      select 1 from public.enrollments e
      where e.course_id = p_course and e.user_id = p_user
        and e.revoked_at is null and (e.expires_at is null or e.expires_at > now()))
    or (p_user = auth.uid() and (public.is_course_instructor(p_course) or public.is_staff()));
$$;

-- Lesson is unlocked when the user has access and any drip delay has passed
create or replace function public.lesson_unlocked(p_lesson uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when l.is_preview then true
    when public.is_staff() or public.is_course_instructor(l.course_id) then true
    when not public.has_course_access(l.course_id) then false
    when l.drip_days is null then true
    else exists(select 1 from public.enrollments e
                where e.user_id = auth.uid() and e.course_id = l.course_id
                  and e.enrolled_at + make_interval(days => l.drip_days) <= now())
  end
  from public.lessons l where l.id = p_lesson;
$$;

-- ---------- Progress ----------
create or replace function public.recompute_enrollment(p_user uuid, p_course uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_required int; v_done int; v_pct numeric; v_course record; v_name text;
begin
  select count(*) into v_required from public.lessons where course_id = p_course and is_required;
  select count(*) into v_done from public.lesson_progress lp
    join public.lessons l on l.id = lp.lesson_id
    where lp.user_id = p_user and lp.course_id = p_course and l.is_required and lp.completed_at is not null;
  v_pct := case when v_required = 0 then 0 else round(100.0 * v_done / v_required, 2) end;

  update public.enrollments
     set progress_pct = v_pct,
         last_activity_at = now(),
         completed_at = case when v_pct >= 100 then coalesce(completed_at, now()) else null end
   where user_id = p_user and course_id = p_course;

  select * into v_course from public.courses where id = p_course;
  if v_pct >= 100 and v_course.certificate_enabled then
    select coalesce(nullif(full_name,''), email::text) into v_name from public.profiles where id = p_user;
    insert into public.certificates (user_id, course_id, recipient_name)
    values (p_user, p_course, coalesce(v_name, 'Student'))
    on conflict (user_id, course_id) do nothing;
  end if;
end $$;

-- Called by the player every ~10-15s and on pause/end.
-- p_delta_seconds = seconds actually watched since last beat (capped server-side).
create or replace function public.record_video_progress(p_lesson uuid, p_position int, p_delta_seconds int)
returns table (completed boolean, progress_pct numeric)
language plpgsql security definer set search_path = public as $$
declare
  v_l record; v_dur numeric; v_row public.lesson_progress; v_delta int;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select l.*, va.duration_seconds as video_dur into v_l
    from public.lessons l left join public.video_assets va on va.id = l.video_asset_id
   where l.id = p_lesson;
  if not found then raise exception 'lesson not found'; end if;
  if not public.lesson_unlocked(p_lesson) or not public.has_course_access(v_l.course_id) then
    raise exception 'no access';
  end if;

  v_dur := coalesce(nullif(v_l.video_dur, 0), nullif(v_l.duration_seconds, 0), 0);
  v_delta := greatest(0, least(coalesce(p_delta_seconds, 0), 30)); -- anti-tamper cap per heartbeat

  insert into public.lesson_progress as lp (user_id, lesson_id, course_id, watched_seconds, last_position_seconds)
  values (auth.uid(), p_lesson, v_l.course_id, v_delta, greatest(p_position, 0))
  on conflict (user_id, lesson_id) do update
     set watched_seconds = least(lp.watched_seconds + v_delta, coalesce(nullif(v_dur,0)::int, lp.watched_seconds + v_delta)),
         last_position_seconds = greatest(p_position, 0),
         updated_at = now()
  returning * into v_row;

  if v_row.completed_at is null and v_dur > 0 and v_row.watched_seconds >= v_dur * v_l.completion_threshold then
    update public.lesson_progress set completed_at = now()
     where user_id = auth.uid() and lesson_id = p_lesson returning * into v_row;
  end if;

  update public.enrollments set last_lesson_id = p_lesson, last_activity_at = now()
   where user_id = auth.uid() and course_id = v_l.course_id;
  perform public.recompute_enrollment(auth.uid(), v_l.course_id);

  return query select v_row.completed_at is not null,
    (select e.progress_pct from public.enrollments e where e.user_id = auth.uid() and e.course_id = v_l.course_id);
end $$;

-- Non-video lessons (text, pdf, download) are marked complete explicitly
create or replace function public.complete_lesson(p_lesson uuid) returns numeric
language plpgsql security definer set search_path = public as $$
declare v_course uuid; v_type public.lesson_type;
begin
  select course_id, type into v_course, v_type from public.lessons where id = p_lesson;
  if v_course is null then raise exception 'lesson not found'; end if;
  if v_type in ('video','quiz') then raise exception 'this lesson type completes automatically'; end if;
  if not public.lesson_unlocked(p_lesson) or not public.has_course_access(v_course) then raise exception 'no access'; end if;
  insert into public.lesson_progress (user_id, lesson_id, course_id, completed_at)
  values (auth.uid(), p_lesson, v_course, now())
  on conflict (user_id, lesson_id) do update set completed_at = coalesce(public.lesson_progress.completed_at, now()), updated_at = now();
  update public.enrollments set last_lesson_id = p_lesson, last_activity_at = now()
   where user_id = auth.uid() and course_id = v_course;
  perform public.recompute_enrollment(auth.uid(), v_course);
  return (select progress_pct from public.enrollments where user_id = auth.uid() and course_id = v_course);
end $$;

-- Quiz grading happens server-side so answers never reach the browser
create or replace function public.submit_quiz(p_lesson uuid, p_answers jsonb)
returns table (score numeric, passed boolean)
language plpgsql security definer set search_path = public as $$
declare
  v_course uuid; v_body jsonb; v_q jsonb; v_total int := 0; v_right int := 0; v_pass numeric; v_score numeric;
begin
  select l.course_id, b.body into v_course, v_body
    from public.lessons l join public.lesson_bodies b on b.lesson_id = l.id
   where l.id = p_lesson and l.type = 'quiz';
  if v_course is null then raise exception 'quiz not found'; end if;
  if not public.lesson_unlocked(p_lesson) or not public.has_course_access(v_course) then raise exception 'no access'; end if;

  -- body: { "pass_pct": 70, "questions": [{ "id": "q1", "correct": "b", ... }] }
  for v_q in select * from jsonb_array_elements(coalesce(v_body->'questions', '[]'::jsonb)) loop
    v_total := v_total + 1;
    if p_answers->>(v_q->>'id') = v_q->>'correct' then v_right := v_right + 1; end if;
  end loop;
  v_pass := coalesce((v_body->>'pass_pct')::numeric, 70);
  v_score := case when v_total = 0 then 100 else round(100.0 * v_right / v_total, 2) end;

  insert into public.quiz_attempts (user_id, lesson_id, answers, score, passed)
  values (auth.uid(), p_lesson, p_answers, v_score, v_score >= v_pass);

  if v_score >= v_pass then
    insert into public.lesson_progress (user_id, lesson_id, course_id, completed_at)
    values (auth.uid(), p_lesson, v_course, now())
    on conflict (user_id, lesson_id) do update set completed_at = coalesce(public.lesson_progress.completed_at, now()), updated_at = now();
    perform public.recompute_enrollment(auth.uid(), v_course);
  end if;
  return query select v_score, v_score >= v_pass;
end $$;

-- Free courses: self-enrol
create or replace function public.enroll_free(p_course uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if not exists (select 1 from public.courses c where c.id = p_course and c.status = 'published')
     or exists (select 1 from public.prices p where p.course_id = p_course and p.is_active and p.amount_minor > 0) then
    raise exception 'course is not free';
  end if;
  insert into public.enrollments (user_id, course_id, source) values (auth.uid(), p_course, 'free')
  on conflict (user_id, course_id) do update set revoked_at = null;
end $$;

-- ---------- Order fulfilment (service role only) ----------
-- Idempotent: safe to call again for the same order from duplicate webhooks.
create or replace function public.fulfill_order(p_order uuid, p_gateway_ref text default null)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_o public.orders; v_item record; v_course uuid; v_courses uuid[]; v_n int;
  v_item_net numeric; v_course_net numeric; v_ins record; v_aff public.affiliates;
  v_order_net bigint; v_hold interval := interval '30 days'; -- refund window before earnings become payable
begin
  select * into v_o from public.orders where id = p_order for update;
  if not found then raise exception 'order not found'; end if;
  if v_o.status = 'paid' then return false; end if;
  if v_o.status not in ('pending','failed') then raise exception 'order % cannot be fulfilled from status %', p_order, v_o.status; end if;

  update public.orders set status = 'paid', paid_at = now(),
         gateway_session_id = coalesce(gateway_session_id, p_gateway_ref)
   where id = p_order returning * into v_o;

  for v_item in select * from public.order_items where order_id = p_order loop
    -- revenue for this line, excluding tax
    v_item_net := (v_item.unit_amount_minor * v_item.quantity - v_item.discount_minor);
    if v_o.tax_rate > 0 and exists (select 1 from public.tax_rates t where t.country_code = v_o.billing_country and t.prices_include_tax) then
      v_item_net := v_item_net / (1 + v_o.tax_rate);
    end if;

    if v_item.course_id is not null then
      v_courses := array[v_item.course_id];
    else
      select array_agg(course_id order by position) into v_courses from public.bundle_courses where bundle_id = v_item.bundle_id;
    end if;
    v_n := coalesce(array_length(v_courses, 1), 0);

    foreach v_course in array coalesce(v_courses, '{}') loop
      insert into public.enrollments (user_id, course_id, source, order_id, bundle_id, expires_at)
      select v_o.user_id, v_course,
             case when v_item.bundle_id is null then 'purchase'::public.enrollment_source else 'bundle' end,
             p_order, v_item.bundle_id,
             case when c.access_days is null then null else now() + make_interval(days => c.access_days) end
        from public.courses c where c.id = v_course
      on conflict (user_id, course_id) do update
         set revoked_at = null, order_id = excluded.order_id,
             expires_at = case when public.enrollments.expires_at is null or excluded.expires_at is null then null
                               else greatest(public.enrollments.expires_at, excluded.expires_at) end;

      -- bundle revenue is split equally across its courses
      v_course_net := v_item_net / greatest(v_n, 1);
      for v_ins in
        select ci.instructor_id, coalesce(ci.revenue_share_pct, i.default_revenue_share_pct) as pct
          from public.course_instructors ci join public.instructors i on i.id = ci.instructor_id
         where ci.course_id = v_course
      loop
        if v_ins.pct > 0 then
          insert into public.instructor_earnings
            (instructor_id, order_id, order_item_id, course_id, currency, net_revenue_minor, share_pct, amount_minor, available_at)
          values (v_ins.instructor_id, p_order, v_item.id, v_course, v_o.currency, round(v_course_net),
                  v_ins.pct, round(v_course_net * v_ins.pct / 100), now() + v_hold)
          on conflict do nothing;
        end if;
      end loop;
    end loop;
  end loop;

  -- affiliate / IB commission (no self-referrals), plus the master IB's override (tier 2)
  if v_o.affiliate_id is not null then
    select * into v_aff from public.affiliates where id = v_o.affiliate_id;
    if v_aff.status = 'approved' and v_aff.user_id <> v_o.user_id then
      v_order_net := v_o.total_minor - v_o.tax_minor;
      insert into public.affiliate_commissions (affiliate_id, order_id, tier, currency, net_revenue_minor, commission_pct, amount_minor, available_at)
      values (v_aff.id, p_order, 1, v_o.currency, v_order_net, v_aff.commission_pct,
              round(v_order_net * v_aff.commission_pct / 100), now() + v_hold)
      on conflict (order_id, affiliate_id) do nothing;

      if v_aff.parent_affiliate_id is not null and v_aff.override_pct > 0 then
        insert into public.affiliate_commissions (affiliate_id, order_id, tier, currency, net_revenue_minor, commission_pct, amount_minor, available_at)
        select par.id, p_order, 2, v_o.currency, v_order_net, v_aff.override_pct,
               round(v_order_net * v_aff.override_pct / 100), now() + v_hold
          from public.affiliates par
         where par.id = v_aff.parent_affiliate_id and par.status = 'approved' and par.user_id <> v_o.user_id
        on conflict (order_id, affiliate_id) do nothing;
      end if;
    end if;
  end if;

  if v_o.coupon_id is not null then
    update public.coupons set redeemed_count = redeemed_count + 1 where id = v_o.coupon_id;
  end if;

  insert into public.audit_log (action, entity, entity_id, data)
  values ('order.fulfilled', 'order', p_order::text, jsonb_build_object('gateway', v_o.gateway, 'ref', p_gateway_ref));
  return true;
end $$;

-- Refunds (service role only). Full refund revokes access and reverses unpaid earnings.
create or replace function public.apply_refund(p_order uuid, p_amount bigint, p_reason text default null,
                                               p_gateway_refund_id text default null, p_actor uuid default null)
returns public.order_status
language plpgsql security definer set search_path = public as $$
declare v_o public.orders; v_ratio numeric; v_full boolean;
begin
  select * into v_o from public.orders where id = p_order for update;
  if p_gateway_refund_id is not null and exists (select 1 from public.refunds where gateway_refund_id = p_gateway_refund_id) then
    return v_o.status; -- duplicate webhook
  end if;
  if v_o.status not in ('paid','partially_refunded') then raise exception 'order not refundable'; end if;
  if p_amount <= 0 or v_o.refunded_minor + p_amount > v_o.total_minor then raise exception 'invalid refund amount'; end if;

  insert into public.refunds (order_id, amount_minor, reason, gateway_refund_id, created_by)
  values (p_order, p_amount, p_reason, p_gateway_refund_id, p_actor);

  v_full := v_o.refunded_minor + p_amount >= v_o.total_minor;
  v_ratio := 1 - (v_o.refunded_minor + p_amount)::numeric / nullif(v_o.total_minor, 0);

  update public.orders set refunded_minor = refunded_minor + p_amount,
         status = case when v_full then 'refunded'::public.order_status else 'partially_refunded' end
   where id = p_order;

  if v_full then
    update public.enrollments set revoked_at = now() where order_id = p_order and revoked_at is null;
    update public.instructor_earnings set status = 'reversed' where order_id = p_order and status in ('pending','approved');
    update public.affiliate_commissions set status = 'reversed' where order_id = p_order and status in ('pending','approved');
  else
    update public.instructor_earnings set amount_minor = round(share_pct / 100 * net_revenue_minor * v_ratio)
     where order_id = p_order and status in ('pending','approved');
    update public.affiliate_commissions set amount_minor = round(commission_pct / 100 * net_revenue_minor * v_ratio)
     where order_id = p_order and status in ('pending','approved');
  end if;

  insert into public.audit_log (actor_id, action, entity, entity_id, data)
  values (p_actor, 'order.refunded', 'order', p_order::text, jsonb_build_object('amount', p_amount, 'full', v_full));
  return (select status from public.orders where id = p_order);
end $$;

-- Pending earnings past the refund window become payable (run daily via pg_cron or a Vercel cron)
create or replace function public.release_matured_earnings() returns void
language sql security definer set search_path = public as $$
  update public.instructor_earnings set status = 'approved' where status = 'pending' and available_at <= now();
  update public.affiliate_commissions set status = 'approved' where status = 'pending' and available_at <= now();
$$;

-- Lock down service-only functions
revoke all on function public.fulfill_order(uuid, text) from public, anon, authenticated;
revoke all on function public.apply_refund(uuid, bigint, text, text, uuid) from public, anon, authenticated;
revoke all on function public.release_matured_earnings() from public, anon, authenticated;
revoke all on function public.recompute_enrollment(uuid, uuid) from public, anon, authenticated;
