-- Email designs live in the database: Claude adds a new design as a draft, an admin previews and approves it
-- in Admin -> Emails & updates -> Designs, and approved designs appear in the team's Design list.
create table if not exists public.email_designs (
  id text primary key check (id ~ '^[a-z0-9-]{3,60}$' and id <> 'message'),
  name text not null,
  description text,
  default_subject text,
  html text not null,          -- placeholders: {{tag}} {{unsubscribe_url}} {{note}} {{first_name}}
  text_body text not null,     -- placeholders: {{tag}} {{unsubscribe_url}} {{note_text}} {{first_name}}
  status text not null default 'draft' check (status in ('draft','approved','retired')),
  sort int not null default 100,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.email_designs enable row level security;
revoke all on public.email_designs from anon, authenticated;

-- campaigns now name any design in the table (or 'message'), so the fixed list goes
alter table public.email_campaigns drop constraint if exists email_campaigns_design_check;
