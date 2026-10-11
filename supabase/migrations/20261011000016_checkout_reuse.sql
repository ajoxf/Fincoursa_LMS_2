-- Remember the provider's payment page for a pending order, so pressing Pay again (refresh, back button,
-- second tab) returns the buyer to the same payment instead of starting a second one.
alter table public.orders add column if not exists gateway_redirect_url text;
create index if not exists orders_pending_user_idx on public.orders (user_id, created_at desc) where status = 'pending';
