-- Instructor earnings as a statement, like Udemy / Teachable: for each course sold,
--   list price - discount code - FinCoursa credit used = paid by the student (before tax)
--   - payment processing fee - partner commission - cashback credit given = amount shared
--   x the instructor's share % = earnings (never below zero).
-- Fee % is in site_settings 'instructor_deductions' (Admin -> Instructors). Each sale keeps the figures it was sold with.

alter table public.instructor_earnings
  add column if not exists list_minor bigint,
  add column if not exists code_discount_minor bigint not null default 0,
  add column if not exists credit_used_minor bigint not null default 0,
  add column if not exists tax_minor bigint not null default 0,
  add column if not exists payment_fee_minor bigint not null default 0,
  add column if not exists partner_minor bigint not null default 0,
  add column if not exists cashback_minor bigint not null default 0,
  add column if not exists shared_minor bigint,
  add column if not exists payment_fee_pct numeric(5,2) not null default 0;

insert into public.site_settings (key, value) values ('instructor_deductions', '{"payment_fee_pct": 2.5}'::jsonb)
on conflict (key) do nothing;

-- Fill in the statement figures for one earning row (used on insert and to recalculate).
create or replace function public.instructor_earning_compute(e public.instructor_earnings)
returns public.instructor_earnings language plpgsql stable security definer set search_path = public as $$
declare
  o public.orders; it public.order_items; v_n int; v_order_net numeric; v_ratio numeric; v_item_ratio numeric;
  v_fee_pct numeric; v_partner numeric := 0; v_aff public.affiliates; v_par public.affiliates; v_extra bigint;
begin
  select * into o from public.orders where id = e.order_id;
  select * into it from public.order_items where id = e.order_item_id;
  -- a programme's price is split equally across its courses
  select greatest(count(*), 1) into v_n from public.bundle_courses where bundle_id = it.bundle_id;
  if it.bundle_id is null then v_n := 1; end if;
  v_order_net := greatest(o.total_minor - o.tax_minor, 0);
  v_ratio := case when v_order_net > 0 then e.net_revenue_minor / v_order_net else 0 end;      -- this course's part of the order
  v_item_ratio := case when (it.unit_amount_minor * it.quantity) > 0 then 1.0 / v_n else 0 end;

  e.list_minor := round(it.unit_amount_minor * it.quantity * v_item_ratio);
  e.credit_used_minor := round(coalesce(o.credit_minor, 0) * v_ratio);
  -- order_items.discount_minor is the code + founding discount + credit together
  e.code_discount_minor := greatest(0, round(it.discount_minor * v_item_ratio) - e.credit_used_minor);
  e.tax_minor := round(o.tax_minor * v_ratio);

  v_fee_pct := case when coalesce(o.gateway, 'free') in ('free', 'manual') or o.total_minor = 0 then 0
                    else coalesce((select (value->>'payment_fee_pct')::numeric from public.site_settings where key = 'instructor_deductions'), 0) end;
  e.payment_fee_pct := v_fee_pct;
  e.payment_fee_minor := round(o.total_minor * v_ratio * v_fee_pct / 100);   -- the fee is charged on the full amount, tax included

  if o.affiliate_id is not null then
    select * into v_aff from public.affiliates where id = o.affiliate_id;
    if v_aff.status = 'approved' and v_aff.user_id <> o.user_id then
      v_partner := v_aff.commission_pct;
      select * into v_par from public.affiliates where id = v_aff.parent_affiliate_id;
      if v_par.id is not null and v_par.status = 'approved' and v_par.user_id <> o.user_id then v_partner := v_partner + v_aff.override_pct; end if;
    end if;
  end if;
  e.partner_minor := round(e.net_revenue_minor * v_partner / 100);

  -- cashback: what the order earned, plus any feedback-and-review top-up for that order
  select coalesce(sum(g.amount_minor), 0) into v_extra from public.credit_grants g join public.orders oo on oo.user_id = g.user_id
   where oo.id = o.id and g.revoked_at is null and g.note = 'Feedback and review cashback, order #' || o.number;
  e.cashback_minor := round((coalesce(o.cashback_minor, 0) + v_extra) * v_ratio);

  e.shared_minor := greatest(0, e.net_revenue_minor - e.payment_fee_minor - e.partner_minor - e.cashback_minor);
  e.amount_minor := round(e.shared_minor * e.share_pct / 100);
  return e;
end $$;
revoke all on function public.instructor_earning_compute(public.instructor_earnings) from public, anon, authenticated;

create or replace function public.instructor_earnings_before_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  return public.instructor_earning_compute(new);
end $$;
drop trigger if exists instructor_earnings_statement on public.instructor_earnings;
create trigger instructor_earnings_statement before insert on public.instructor_earnings
  for each row execute function public.instructor_earnings_before_insert();

-- Recalculate an order's earnings that haven't been paid out (e.g. after a review cashback top-up).
create or replace function public.recalc_instructor_earnings(p_order uuid)
returns int language plpgsql security definer set search_path = public as $$
declare r public.instructor_earnings; c public.instructor_earnings; n int := 0;
begin
  for r in select * from public.instructor_earnings where order_id = p_order and status in ('pending', 'approved') and payout_id is null for update loop
    c := public.instructor_earning_compute(r);
    update public.instructor_earnings set list_minor = c.list_minor, code_discount_minor = c.code_discount_minor, credit_used_minor = c.credit_used_minor,
      tax_minor = c.tax_minor, payment_fee_minor = c.payment_fee_minor, payment_fee_pct = c.payment_fee_pct, partner_minor = c.partner_minor,
      cashback_minor = c.cashback_minor, shared_minor = c.shared_minor, amount_minor = c.amount_minor
     where id = r.id;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.recalc_instructor_earnings(uuid) from public, anon, authenticated;
grant execute on function public.recalc_instructor_earnings(uuid) to service_role;

-- Existing unpaid earnings move to the new calculation.
do $$ declare o uuid; begin
  for o in select distinct order_id from public.instructor_earnings where status in ('pending', 'approved') and payout_id is null loop
    perform public.recalc_instructor_earnings(o);
  end loop;
end $$;
