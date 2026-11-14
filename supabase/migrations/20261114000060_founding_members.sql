-- Founding members: early buyers get a lasting discount on their future purchases.
-- Settings (Admin → Founding members, site_settings 'founding'):
--   enabled, qualifying_course_ids (buying one of these makes you a member), join_ends_at (null = open),
--   cap (max members, null = no cap), mode ('percent' | 'fixed'), percent, fixed ({"USD": 1500} minor units),
--   benefit_ends_at (null = lifetime), allow_with_coupon.

create table if not exists public.founding_members (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  member_number int generated always as identity,
  source text not null check (source in ('purchase', 'manual')),
  order_id uuid references public.orders(id) on delete set null,
  note text,
  joined_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null
);
alter table public.founding_members enable row level security;
drop policy if exists "own membership" on public.founding_members;
create policy "own membership" on public.founding_members for select using (user_id = auth.uid() or public.is_staff());

-- the founding-member part of orders.discount_minor (which stays the total discount)
alter table public.orders add column if not exists founding_discount_minor bigint not null default 0 check (founding_discount_minor >= 0);

-- On payment: buying a qualifying course inside the window (and under the cap) makes the buyer a member.
create or replace function public.maybe_add_founding_member(p_order uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_o public.orders; v_s jsonb; v_cap int; v_ends timestamptz;
begin
  select * into v_o from public.orders where id = p_order;
  if not found or v_o.status <> 'paid' then return; end if;
  select value into v_s from public.site_settings where key = 'founding';
  if v_s is null or coalesce((v_s->>'enabled')::boolean, false) = false then return; end if;
  v_ends := nullif(v_s->>'join_ends_at', '')::timestamptz;
  if v_ends is not null and coalesce(v_o.paid_at, now()) > v_ends then return; end if;
  if not exists (
    select 1 from public.order_items i
     where i.order_id = p_order and i.course_id is not null
       and i.course_id::text in (select jsonb_array_elements_text(coalesce(v_s->'qualifying_course_ids', '[]'::jsonb)))
  ) then return; end if;
  if exists (select 1 from public.founding_members where user_id = v_o.user_id) then return; end if;

  perform pg_advisory_xact_lock(hashtext('founding_members'));  -- one at a time, so the cap holds
  v_cap := nullif(v_s->>'cap', '')::int;
  if v_cap is not null and (select count(*) from public.founding_members where revoked_at is null) >= v_cap then return; end if;
  insert into public.founding_members (user_id, source, order_id) values (v_o.user_id, 'purchase', p_order)
  on conflict (user_id) do nothing;
end $$;
revoke all on function public.maybe_add_founding_member(uuid) from public, anon, authenticated;

-- Extend the order status trigger: credit + cashback (cashback migration) and founding membership.
-- A full refund of the order that made someone a member ends the membership.
create or replace function public.orders_credit_on_status()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'paid' and old.status is distinct from 'paid' then
    perform public.apply_order_credit(new.id);
    perform public.maybe_add_founding_member(new.id);
  elsif new.status in ('refunded', 'partially_refunded')
        and (old.status is distinct from new.status or old.refunded_minor is distinct from new.refunded_minor) then
    perform public.reverse_order_credit(new.id);
    if new.status = 'refunded' then
      update public.founding_members set revoked_at = now()
       where order_id = new.id and source = 'purchase' and revoked_at is null;
    end if;
  end if;
  return null;
end $$;

insert into public.site_settings (key, value)
values ('founding', '{"enabled": false, "qualifying_course_ids": [], "join_ends_at": null, "cap": null, "mode": "percent", "percent": 20, "fixed": {}, "benefit_ends_at": null, "allow_with_coupon": false}')
on conflict (key) do nothing;
