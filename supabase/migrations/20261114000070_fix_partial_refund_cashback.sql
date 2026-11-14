-- Partial refunds: an order's cashback keeps the share for the part not refunded, less what the buyer
-- has already spent from it. (The first version counted earlier partial-refund reductions as "spent",
-- so a second partial refund could wipe the cashback out.)
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
    update public.credit_grants g
       set remaining_minor = greatest(0, least(g.remaining_minor, round(g.amount_minor * v_ratio)::bigint - coalesce((
             select sum(r.amount_minor) from public.credit_redemptions r where r.grant_id = g.id and r.reversed_at is null), 0)))
     where g.order_id = p_order and g.source = 'cashback' and g.revoked_at is null;
  end if;
end $$;
revoke all on function public.reverse_order_credit(uuid) from public, anon, authenticated;
