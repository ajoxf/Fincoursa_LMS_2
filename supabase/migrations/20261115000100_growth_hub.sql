-- Growth hub (Admin → Marketing): institution leads, an approvals outbox, and course demand.

-- Waitlist ("Notify me") and enquiries remember which course and which country they came from,
-- so Admin → Marketing → Demand can count interest per course.
alter table public.contact_requests
  add column if not exists course_id uuid references public.courses(id) on delete set null,
  add column if not exists country text;
create index if not exists contact_requests_course on public.contact_requests (course_id);

-- Organisations interested in buying for a team, a university or a cohort.
create table if not exists public.institution_leads (
  id uuid primary key default gen_random_uuid(),
  organization text not null,
  org_type text not null default 'other'
    check (org_type in ('bank', 'broker', 'asset_manager', 'insurance', 'fintech', 'university', 'training', 'corporate', 'other')),
  country text,
  contact_name text,
  email citext,
  role text,
  team_size int check (team_size is null or team_size > 0),
  course_ids uuid[] not null default '{}',
  message text,
  -- enquiry = "For Institutions" form; domain = several people from one organisation signed up; manual = added by staff
  source text not null default 'enquiry' check (source in ('enquiry', 'domain', 'manual')),
  email_domain text,
  stage text not null default 'new' check (stage in ('new', 'contacted', 'proposal', 'pilot', 'won', 'lost')),
  -- the quote: seats, per-seat price, currency, discount, total (minor units)
  seats int, currency text, seat_price_minor bigint, discount_pct numeric(5,2) not null default 0, value_minor bigint,
  proposal_token text unique,
  proposal_sent_at timestamptz,
  next_follow_up_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists institution_leads_stage on public.institution_leads (stage, created_at desc);
create unique index if not exists institution_leads_domain_signal on public.institution_leads (lower(email_domain)) where source = 'domain';

-- Timeline of everything that happened with a lead.
create table if not exists public.lead_events (
  id bigint generated always as identity primary key,
  lead_id uuid not null references public.institution_leads(id) on delete cascade,
  kind text not null,
  body text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists lead_events_lead on public.lead_events (lead_id, created_at desc);

-- Emails waiting for a person to approve (proposals, follow-ups). Nothing here is sent until approved.
create table if not exists public.outbox (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.institution_leads(id) on delete cascade,
  kind text not null check (kind in ('proposal', 'follow_up', 'manual')),
  step int not null default 0,
  to_email citext not null,
  to_name text,
  subject text not null,
  body text not null,
  cta_label text,
  cta_url text,
  reason text,                                   -- why it was drafted, shown to the approver
  status text not null default 'pending' check (status in ('pending', 'sent', 'rejected', 'failed')),
  error text,
  decided_by uuid references public.profiles(id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists outbox_pending on public.outbox (status, created_at);
-- one automatic draft per lead and step
create unique index if not exists outbox_one_per_step on public.outbox (lead_id, kind, step) where kind <> 'manual';

alter table public.institution_leads enable row level security;
alter table public.lead_events enable row level security;
alter table public.outbox enable row level security;
drop policy if exists "staff read leads" on public.institution_leads;
create policy "staff read leads" on public.institution_leads for select using (public.is_staff());
drop policy if exists "staff read lead events" on public.lead_events;
create policy "staff read lead events" on public.lead_events for select using (public.is_staff());
drop policy if exists "staff read outbox" on public.outbox;
create policy "staff read outbox" on public.outbox for select using (public.is_staff());
