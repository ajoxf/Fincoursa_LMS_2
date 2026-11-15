-- Question Bank launch offers.
-- 1. Access options (the "Through June 2027" price) — below.
-- 2. Free sample: free preview quizzes can be checked and scored for anyone signed in (end of file).

-- Access options: a course can have extra prices that give access until a fixed date, e.g.
-- "CMT Level 2 Question Bank, through 30 Jun 2027" at $129 next to the standard 90-day price.
-- Admin → Courses → Pricing → Access options. Buyers choose on the course page and at checkout.
alter table public.prices
  add column if not exists access_until date,  -- access ends at the end of this day (UAE time); null = the course's access period
  add column if not exists label text;         -- shown to buyers, e.g. "Through June 2027 exam"

-- Fulfilment: unchanged except that an access option's end date is used for the enrolment.
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
             -- an access option ("through 30 Jun 2027") sets its own end date; otherwise the course's access period
             case when p.access_until is not null then (p.access_until::timestamp + interval '1 day' - interval '1 second') at time zone 'Asia/Dubai'
                  when c.access_days is null then null else now() + make_interval(days => c.access_days) end
        from public.courses c left join public.prices p on p.id = v_item.price_id
       where c.id = v_course
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

-- Free sample: practice-mode checking and exam scoring for free preview quizzes, for anyone signed in.
-- Unchanged otherwise.
create or replace function public.quiz_check(p_lesson uuid, p_question text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_course uuid; v_keys public.quiz_answer_keys;
begin
  if auth.uid() is null then return null; end if;
  select course_id into v_course from public.lessons where id = p_lesson and type = 'quiz';
  if v_course is null or not coalesce(public.lesson_unlocked(p_lesson), false)
     or (not public.has_course_access(v_course) and not exists (select 1 from public.lessons where id = p_lesson and is_preview)) then
    return null;
  end if;
  select * into v_keys from public.quiz_answer_keys where lesson_id = p_lesson;
  if v_keys.lesson_id is null or not (v_keys.answers ? p_question) then return null; end if;
  return jsonb_build_object(
    'correct', v_keys.answers->>p_question,
    'explanation', coalesce(v_keys.explanations->>p_question, ''));
end $$;

create or replace function public.submit_quiz(p_lesson uuid, p_answers jsonb)
returns table (score numeric, passed boolean)
language plpgsql security definer set search_path = public as $$
declare
  v_course uuid; v_body jsonb; v_key jsonb; v_q jsonb; v_total int := 0; v_right int := 0; v_pass numeric; v_score numeric;
begin
  select l.course_id, b.body into v_course, v_body
    from public.lessons l join public.lesson_bodies b on b.lesson_id = l.id
   where l.id = p_lesson and l.type = 'quiz';
  if v_course is null then raise exception 'quiz not found'; end if;
  if auth.uid() is null then raise exception 'sign in to take this quiz'; end if;
  -- free preview quizzes (the free sample) are open to anyone signed in; other quizzes need access to the course
  if not public.lesson_unlocked(p_lesson)
     or (not public.has_course_access(v_course) and not exists (select 1 from public.lessons where id = p_lesson and is_preview)) then
    raise exception 'no access';
  end if;
  select answers into v_key from public.quiz_answer_keys where lesson_id = p_lesson;
  v_key := coalesce(v_key, '{}'::jsonb);

  for v_q in select * from jsonb_array_elements(coalesce(v_body->'questions', '[]'::jsonb)) loop
    v_total := v_total + 1;
    if nullif(v_key->>(v_q->>'id'), '') is not null and p_answers->>(v_q->>'id') = v_key->>(v_q->>'id') then
      v_right := v_right + 1;
    end if;
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
