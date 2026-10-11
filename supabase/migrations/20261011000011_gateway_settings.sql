-- Payment provider API keys, entered by admins on /admin/payments.
-- Secret values are encrypted by the app (AES-256-GCM) before they reach the database, and the
-- table is closed to every client role: only the server (service role) can read or write it.

create table if not exists public.gateway_settings (
  gateway     text primary key,                 -- adapter id: 'stripe', 'razorpay', 'tap', 'paypal', ...
  enabled     boolean not null default true,    -- admins can pause a provider without deleting its keys
  public_values jsonb not null default '{}',    -- non-secret settings (key ids, environment)
  secrets_enc text,                             -- encrypted JSON of secret values
  secret_hints jsonb not null default '{}',     -- last 4 characters of each secret, for the admin screen
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users(id) on delete set null
);

alter table public.gateway_settings enable row level security;
-- no policies on purpose: anon and signed-in users get nothing
revoke all on public.gateway_settings from anon, authenticated;
