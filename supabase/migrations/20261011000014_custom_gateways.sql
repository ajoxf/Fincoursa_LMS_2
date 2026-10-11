-- Payment providers added by admins without code: a hosted payment link and/or instructions,
-- confirmed by a signed webhook or by an admin marking the order paid. Server access only.
create table if not exists public.custom_gateways (
  id           text primary key check (id ~ '^custom-[a-z0-9-]{1,40}$'),
  name         text not null,              -- admin-facing, e.g. "Ziina"
  label        text not null,              -- buyer-facing, e.g. "Pay with Ziina"
  instructions text,                       -- shown to the buyer on the payment page
  pay_url      text,                       -- optional link template with {amount}, {currency}, {order_number}, ...
  currencies   text[],                     -- null = any
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
alter table public.custom_gateways enable row level security;
revoke all on public.custom_gateways from anon, authenticated;
