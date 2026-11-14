-- Cashback & store credit.
-- A paid order can earn cashback: credit in the order's currency that the buyer can spend on a later purchase.
-- Rules are set by an admin (Admin → Cashback & credit, stored in site_settings 'cashback'):
--   enabled, mode ('percent' of the amount paid before tax, or a 'fixed' amount per currency), percent,
--   fixed ({"USD": 1000, ...} in minor units), validity_days (null = never expires),
--   max_redeem_pct (most of an order's price that credit may pay), allow_with_coupon, earn_on_credit.
-- A course or programme can override it: cashback_mode null = use the default, 'none', 'percent'
-- (cashback_percent) or 'fixed' (cashback_fixed, per currency).

alter table public.courses
  add column if not exists cashback_mode text check (cashback_mode in ('none', 'percent', 'fixed')),
  add column if not exists cashback_percent numeric(5,2) check (cashback_percent is null or (cashback_percent >= 0 and cashback_percent <= 100)),
  add column if not exists cashback_fixed jsonb;
alter table public.bundles
  add column if not exists cashback_mode text check (cashback_mode in ('none', 'percent', 'fixed')),
  add column if not exists cashback_percent numeric(5,2) check (cashback_percent is null or (cashback_percent >= 0 and cashback_percent <= 100)),
  add column if not exists cashback_fixed jsonb;

-- orders.discount_minor stays the TOTAL discount (code + credit) so tax, invoices and earnings keep working;
-- credit_minor is the part of it paid with credit. cashback_* are snapshotted when the order is created.
alter table public.orders
  add column if not exists credit_minor bigint not null default 0 check (credit_minor >= 0),
  add column if not exists cashback_minor bigint not null default 0 check (cashback_minor >= 0),
  add column if not exists cashback_valid_days int check (cashback_valid_days is null or cashback_valid_days > 0);

create table if not exists public.credit_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  amount_minor bigint not null check (amount_minor > 0),
  remaining_minor bigint not null check (remaining_minor >= 0),
  source text not null check (source in ('cashback', 'manual')),
  order_id uuid references public.orders(id) on delete set null,
  note text,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  check (remaining_minor <= amount_minor)
);
create unique index if not exists credit_grants_one_cashback_per_order on public.credit_grants(order_id) where source = 'cashback';
create index if not exists credit_grants_user on public.credit_grants(user_id, currency);

create table if not exists public.credit_redemptions (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  grant_id uuid not null references public.credit_grants(id) on delete cascade,
  amount_minor bigint not null check (amount_minor > 0),
  reversed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists credit_redemptions_order on public.credit_redemptions(order_id);

alter table public.credit_grants enable row level security;
alter table public.credit_redemptions enable row level security;
drop policy if exists "own credit" on public.credit_grants;
create policy "own credit" on public.credit_grants for select using (user_id = auth.uid() or public.is_staff());
drop policy if exists "own credit use" on public.credit_redemptions;
create policy "own credit use" on public.credit_redemptions for select
  using (public.is_staff() or exists (select 1 from public.orders o where o.id = order_id and o.user_id = auth.uid()));

-- Spendable credit per currency
create or replace function public.credit_balance(p_user uuid, p_currency text)
returns bigint language sql stable security definer set search_path = public as $$
  select coalesce(sum(remaining_minor), 0)::bigint from public.credit_grants
   where user_id = p_user and currency = upper(p_currency) and revoked_at is null
     and remaining_minor > 0 and (expires_at is null or expires_at > now());
$$;
revoke all on function public.credit_balance(uuid, text) from public, anon, authenticated;

-- Fulfilment: spend the credit the order used (soonest-expiring first), then grant the order's cashback.
create or replace function public.apply_order_credit(p_order uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_o public.orders; v_need bigint; v_g record; v_take bigint;
begin
  select * into v_o from public.orders where id = p_order;
  if not found or v_o.status <> 'paid' then return; end if;

  if v_o.credit_minor > 0 and not exists (select 1 from public.credit_redemptions where order_id = p_order) then
    v_need := v_o.credit_minor;
    for v_g in select id, remaining_minor from public.credit_grants
                where user_id = v_o.user_id and currency = v_o.currency and revoked_at is null and remaining_minor > 0
                  and (expires_at is null or expires_at > now())
                order by expires_at nulls last, created_at for update loop
      exit when v_need <= 0;
      v_take := least(v_need, v_g.remaining_minor);
      update public.credit_grants set remaining_minor = remaining_minor - v_take where id = v_g.id;
      insert into public.credit_redemptions (order_id, grant_id, amount_minor) values (p_order, v_g.id, v_take);
      v_need := v_need - v_take;
    end loop;
    if v_need > 0 then
      insert into public.audit_log (action, entity, entity_id, data)
      values ('credit.shortfall', 'order', p_order::text, jsonb_build_object('missing', v_need));
    end if;
  end if;

  if v_o.cashback_minor > 0 then
    insert into public.credit_grants (user_id, currency, amount_minor, remaining_minor, source, order_id, note, expires_at)
    values (v_o.user_id, v_o.currency, v_o.cashback_minor, v_o.cashback_minor, 'cashback', p_order,
            'Cashback on order #' || v_o.number,
            case when v_o.cashback_valid_days is null then null else now() + make_interval(days => v_o.cashback_valid_days) end)
    on conflict do nothing;
  end if;
end $$;
revoke all on function public.apply_order_credit(uuid) from public, anon, authenticated;

-- Refunds: a full refund returns the credit the order used and cancels its unspent cashback;
-- a partial refund scales the unspent cashback down in proportion.
create or replace function public.reverse_order_credit(p_order uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_o public.orders; v_ratio numeric; v_r record;
begin
  select * into v_o from public.orders where id = p_order;
  if not found then return; end if;
  if v_o.status = 'refunded' then
    for v_r in select id, grant_id, amount_minor from public.credit_redemptions where order_id = p_order and reversed_at is null loop
      update public.credit_grants set remaining_minor = least(amount_minor, remaining_minor + v_r.amount_minor) where id = v_r.grant_id;
      update public.credit_redemptions set reversed_at = now() where id = v_r.id;
    end loop;
    update public.credit_grants set remaining_minor = 0, revoked_at = now()
     where order_id = p_order and source = 'cashback' and revoked_at is null;
  elsif v_o.status = 'partially_refunded' and v_o.total_minor > 0 then
    v_ratio := greatest(0, 1 - v_o.refunded_minor::numeric / v_o.total_minor);
    update public.credit_grants
       -- keep the share of the cashback for the part not refunded, less what was already spent
       set remaining_minor = greatest(0, least(remaining_minor, round(amount_minor * v_ratio)::bigint - (amount_minor - remaining_minor)))
     where order_id = p_order and source = 'cashback' and revoked_at is null;
  end if;
end $$;
revoke all on function public.reverse_order_credit(uuid) from public, anon, authenticated;

-- Hook both into the existing fulfilment and refund functions without rewriting them.
create or replace function public.orders_credit_on_status()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'paid' and old.status is distinct from 'paid' then
    perform public.apply_order_credit(new.id);
  elsif new.status in ('refunded', 'partially_refunded')
        and (old.status is distinct from new.status or old.refunded_minor is distinct from new.refunded_minor) then
    perform public.reverse_order_credit(new.id);
  end if;
  return null;
end $$;
drop trigger if exists orders_credit_on_status on public.orders;
create trigger orders_credit_on_status after update of status, refunded_minor on public.orders
  for each row execute function public.orders_credit_on_status();

-- Admin adjustments (positive adds credit, negative removes it soonest-expiring first)
create or replace function public.adjust_credit(p_user uuid, p_currency text, p_amount bigint, p_note text,
                                                p_expires_at timestamptz, p_actor uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_need bigint; v_g record; v_take bigint;
begin
  if p_amount > 0 then
    insert into public.credit_grants (user_id, currency, amount_minor, remaining_minor, source, note, expires_at, created_by)
    values (p_user, upper(p_currency), p_amount, p_amount, 'manual', p_note, p_expires_at, p_actor);
  elsif p_amount < 0 then
    v_need := -p_amount;
    if public.credit_balance(p_user, p_currency) < v_need then raise exception 'The customer has less credit than that.'; end if;
    for v_g in select id, remaining_minor from public.credit_grants
                where user_id = p_user and currency = upper(p_currency) and revoked_at is null and remaining_minor > 0
                  and (expires_at is null or expires_at > now())
                order by expires_at nulls last, created_at for update loop
      exit when v_need <= 0;
      v_take := least(v_need, v_g.remaining_minor);
      update public.credit_grants set remaining_minor = remaining_minor - v_take where id = v_g.id;
      v_need := v_need - v_take;
    end loop;
  end if;
  insert into public.audit_log (actor_id, action, entity, entity_id, data)
  values (p_actor, 'credit.adjusted', 'profile', p_user::text, jsonb_build_object('currency', upper(p_currency), 'amount', p_amount, 'note', p_note));
end $$;
revoke all on function public.adjust_credit(uuid, text, bigint, text, timestamptz, uuid) from public, anon, authenticated;

insert into public.site_settings (key, value)
values ('cashback', '{"enabled": false, "mode": "percent", "percent": 10, "fixed": {}, "validity_days": 365, "max_redeem_pct": 100, "allow_with_coupon": true, "earn_on_credit": false}')
on conflict (key) do nothing;
