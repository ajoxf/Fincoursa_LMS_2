-- The store currency is USD. New prices, orders and profiles default to USD;
-- report functions are always called with the site's configured currency.
alter table public.prices   alter column currency set default 'USD';
alter table public.profiles alter column preferred_currency set default 'USD';
