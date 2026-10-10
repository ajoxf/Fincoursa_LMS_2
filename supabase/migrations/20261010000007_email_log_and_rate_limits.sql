-- Email log: one row per transactional email, unique per (template, ref) so an event never emails twice.
create table if not exists public.email_log (
  id bigint generated always as identity primary key,
  template text not null,
  ref text not null,                 -- e.g. order id, certificate id, payout id
  to_email text not null,
  status text not null default 'sent' check (status in ('sent','skipped','failed')),
  provider_id text,
  error text,
  created_at timestamptz not null default now(),
  unique (template, ref)
);
alter table public.email_log enable row level security;
create policy "staff read email log" on public.email_log for select using (public.is_staff());

-- Fixed-window rate limiting backed by Postgres (no extra service needed).
create table if not exists public.rate_limits (
  key text not null,
  window_start timestamptz not null,
  hits int not null default 0,
  primary key (key, window_start)
);
alter table public.rate_limits enable row level security;  -- no policies: service role only

-- Returns true when the call is allowed, false when the limit for the current window is exceeded.
create or replace function public.hit_rate_limit(p_key text, p_limit int, p_window_seconds int)
returns boolean
language plpgsql security definer set search_path = public as $$
declare v_start timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds); v_hits int;
begin
  insert into public.rate_limits (key, window_start, hits) values (p_key, v_start, 1)
  on conflict (key, window_start) do update set hits = public.rate_limits.hits + 1
  returning hits into v_hits;
  -- opportunistic cleanup of old windows
  if random() < 0.01 then delete from public.rate_limits where window_start < now() - interval '1 day'; end if;
  return v_hits <= p_limit;
end $$;
revoke all on function public.hit_rate_limit(text, int, int) from public, anon, authenticated;
