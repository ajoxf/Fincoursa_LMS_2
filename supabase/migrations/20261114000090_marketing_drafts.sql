-- Marketing assistant (Admin → Marketing): every result it writes is saved here so it can be reused.
-- Only staff can read it; the app writes it with the service role.
create table if not exists public.marketing_drafts (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('post', 'ad', 'email', 'plan', 'results', 'ask')),
  title text not null,
  input jsonb not null default '{}'::jsonb,
  output jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'used', 'archived')),
  -- tokens used and approximate cost in US cents, shown next to each result
  input_tokens int, output_tokens int, cost_cents numeric(10,2),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists marketing_drafts_recent on public.marketing_drafts (created_at desc);
alter table public.marketing_drafts enable row level security;
drop policy if exists "staff read marketing drafts" on public.marketing_drafts;
create policy "staff read marketing drafts" on public.marketing_drafts for select using (public.is_staff());
