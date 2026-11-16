-- Emails & updates: imported contacts, designed emails, leaving out buyers, and approval for the team.

-- 1) Contacts who don't have a FinCoursa account (imported by the team, with their consent)
create table if not exists public.email_contacts (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  first_name text,
  last_name text,
  source text,                      -- e.g. "CSV import 16 Nov", "Added by hand"
  unsubscribed_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index if not exists email_contacts_email_key on public.email_contacts (lower(email));
alter table public.email_contacts enable row level security;
revoke all on public.email_contacts from anon, authenticated;

-- 2) Campaign options
alter table public.email_campaigns add column if not exists design text not null default 'message';
alter table public.email_campaigns add column if not exists include_contacts boolean not null default false;
alter table public.email_campaigns add column if not exists exclude_buyers_of uuid references public.courses(id) on delete set null;
alter table public.email_campaigns add column if not exists submitted_by uuid references auth.users(id) on delete set null;
alter table public.email_campaigns add column if not exists approved_by uuid references auth.users(id) on delete set null;
alter table public.email_campaigns add column if not exists approved_at timestamptz;
alter table public.email_campaigns add column if not exists send_mode text;   -- 'now' or 'schedule', chosen when submitted
alter table public.email_campaigns drop constraint if exists email_campaigns_status_check;
alter table public.email_campaigns add constraint email_campaigns_status_check
  check (status in ('draft','awaiting_approval','scheduled','sending','sent','cancelled'));
alter table public.email_campaigns drop constraint if exists email_campaigns_design_check;
alter table public.email_campaigns add constraint email_campaigns_design_check
  check (design in ('message','launch-higher-high','launch-buy-the-dip','launch-breakout','launch-signal'));

-- 3) Recipients can be students (user_id) or imported contacts (contact_id); one email per address per campaign
alter table public.email_campaign_recipients add column if not exists contact_id uuid references public.email_contacts(id) on delete cascade;
alter table public.email_campaign_recipients drop constraint if exists email_campaign_recipients_pkey;
alter table public.email_campaign_recipients alter column user_id drop not null;
alter table public.email_campaign_recipients add column if not exists id bigint generated always as identity;
do $$ begin
  alter table public.email_campaign_recipients add primary key (id);
exception when invalid_table_definition then null; end $$;
create unique index if not exists email_campaign_recipients_email_key on public.email_campaign_recipients (campaign_id, lower(email));
alter table public.email_campaign_recipients drop constraint if exists email_campaign_recipients_who_check;
alter table public.email_campaign_recipients add constraint email_campaign_recipients_who_check
  check (user_id is not null or contact_id is not null);

-- 4) Freeze the recipient list: matching students, plus imported contacts if chosen;
--    leave out buyers of a course, unsubscribed contacts, and anyone whose account has opted out of marketing.
create or replace function public.enqueue_campaign(p_campaign uuid) returns int
language plpgsql security definer set search_path = public as $$
declare v_c public.email_campaigns; v_n int;
begin
  select * into v_c from public.email_campaigns where id = p_campaign for update;
  if not found then raise exception 'campaign not found'; end if;

  insert into public.email_campaign_recipients (campaign_id, user_id, email, name)
  select p_campaign, a.user_id, a.email, a.full_name
  from public.campaign_audience(
    v_c.kind,
    (select array_agg(x::uuid) from jsonb_array_elements_text(coalesce(v_c.audience->'courses', '[]')) x),
    (select array_agg(x) from jsonb_array_elements_text(coalesce(v_c.audience->'countries', '[]')) x),
    coalesce((v_c.audience->>'buyers_only')::boolean, false)) a
  where v_c.exclude_buyers_of is null or not exists (
    select 1 from public.enrollments e where e.user_id = a.user_id and e.course_id = v_c.exclude_buyers_of
      and e.revoked_at is null and e.source <> 'free')
  on conflict do nothing;

  if v_c.include_contacts then
    insert into public.email_campaign_recipients (campaign_id, contact_id, email, name)
    select p_campaign, c.id, lower(c.email), nullif(trim(coalesce(c.first_name,'') || ' ' || coalesce(c.last_name,'')), '')
    from public.email_contacts c
    where c.unsubscribed_at is null
      and not exists (select 1 from public.profiles p where lower(p.email) = lower(c.email)
                        and (p.marketing_opt_in = false
                             or (v_c.exclude_buyers_of is not null and exists (
                                  select 1 from public.enrollments e where e.user_id = p.id and e.course_id = v_c.exclude_buyers_of
                                    and e.revoked_at is null and e.source <> 'free'))))
    on conflict do nothing;
  end if;

  select count(*) into v_n from public.email_campaign_recipients where campaign_id = p_campaign;
  update public.email_campaigns set total = v_n where id = p_campaign;
  return v_n;
end $$;
revoke all on function public.enqueue_campaign(uuid) from public, anon, authenticated;
grant execute on function public.enqueue_campaign(uuid) to service_role;

-- 5) "This will go to N people" in the composer, using the same rules as enqueue_campaign
create or replace function public.campaign_recipient_count(
  p_kind text, p_courses uuid[] default null, p_countries text[] default null, p_buyers_only boolean default false,
  p_include_contacts boolean default false, p_exclude_buyers_of uuid default null)
returns int language sql stable security definer set search_path = public as $$
  with students as (
    select lower(a.email) as email from public.campaign_audience(p_kind, p_courses, p_countries, p_buyers_only) a
    where p_exclude_buyers_of is null or not exists (
      select 1 from public.enrollments e where e.user_id = a.user_id and e.course_id = p_exclude_buyers_of
        and e.revoked_at is null and e.source <> 'free')
  ), contacts as (
    select lower(c.email) as email from public.email_contacts c
    where p_include_contacts and c.unsubscribed_at is null
      and not exists (select 1 from public.profiles p where lower(p.email) = lower(c.email)
                        and (p.marketing_opt_in = false
                             or (p_exclude_buyers_of is not null and exists (
                                  select 1 from public.enrollments e where e.user_id = p.id and e.course_id = p_exclude_buyers_of
                                    and e.revoked_at is null and e.source <> 'free'))))
  )
  select count(*)::int from (select email from students union select email from contacts) x;
$$;
revoke all on function public.campaign_recipient_count(text, uuid[], text[], boolean, boolean, uuid) from public, anon, authenticated;
grant execute on function public.campaign_recipient_count(text, uuid[], text[], boolean, boolean, uuid) to service_role;
