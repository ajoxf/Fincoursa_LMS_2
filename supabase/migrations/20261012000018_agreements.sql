-- Signed agreements with instructors and partners (affiliates / IBs).
-- The team gets them signed however they like (email, in person) and uploads the signed copy here.
-- Files live in the private "agreements" bucket and are only handed out through short-lived signed links
-- by the server (staff, or the person the agreement is with). Server-only table: RLS on, no client policies.

create table if not exists public.agreements (
  id            uuid primary key default gen_random_uuid(),
  party_type    text not null check (party_type in ('instructor', 'affiliate')),
  instructor_id uuid references public.instructors(id) on delete cascade,
  affiliate_id  uuid references public.affiliates(id) on delete cascade,
  title         text not null,
  status        text not null default 'awaiting' check (status in ('awaiting', 'signed')),
  file_path     text,                 -- signed copy (or the draft while awaiting)
  file_name     text,
  sent_at       date,
  signed_at     date,
  valid_until   date,
  notes         text,
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check ((party_type = 'instructor' and instructor_id is not null and affiliate_id is null)
      or (party_type = 'affiliate' and affiliate_id is not null and instructor_id is null))
);
create index if not exists agreements_instructor_idx on public.agreements (instructor_id) where instructor_id is not null;
create index if not exists agreements_affiliate_idx on public.agreements (affiliate_id) where affiliate_id is not null;
alter table public.agreements enable row level security;
revoke all on public.agreements from anon, authenticated;

do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit)
    values ('agreements', 'agreements', false, 26214400)   -- 25 MB, private
    on conflict (id) do nothing;
  end if;
end $$;
