-- Contact groups (e.g. "CMT Group 1") and emails to hand-picked people.
-- A campaign's audience (jsonb) can now also hold:
--   groups: ["CMT Group 1", ...]  only contacts in these groups (when the contact list is included)
--   pick:   ["a@x.com", ...]      only these people (students and contacts), still respecting unsubscribes

alter table public.email_contacts add column if not exists groups text[] not null default '{}';
create index if not exists email_contacts_groups on public.email_contacts using gin (groups);
-- the "where these contacts came from" note becomes the first group, unless it's the automatic "Imported <date>"
update public.email_contacts set groups = array[source]
 where groups = '{}' and source is not null and source !~ '^Imported \d{4}-\d{2}-\d{2}$';

create or replace function public.enqueue_campaign(p_campaign uuid) returns int
language plpgsql security definer set search_path = public as $$
declare v_c public.email_campaigns; v_n int; v_pick text[]; v_groups text[];
begin
  select * into v_c from public.email_campaigns where id = p_campaign for update;
  if not found then raise exception 'campaign not found'; end if;
  v_pick := (select array_agg(lower(x)) from jsonb_array_elements_text(coalesce(v_c.audience->'pick', '[]')) x);
  v_groups := (select array_agg(x) from jsonb_array_elements_text(coalesce(v_c.audience->'groups', '[]')) x);

  insert into public.email_campaign_recipients (campaign_id, user_id, email, name)
  select p_campaign, a.user_id, a.email, a.full_name
  from public.campaign_audience(
    v_c.kind,
    (select array_agg(x::uuid) from jsonb_array_elements_text(coalesce(v_c.audience->'courses', '[]')) x),
    (select array_agg(x) from jsonb_array_elements_text(coalesce(v_c.audience->'countries', '[]')) x),
    coalesce((v_c.audience->>'buyers_only')::boolean, false)) a
  where (v_pick is null or lower(a.email) = any (v_pick))
    and (v_c.exclude_buyers_of is null or not exists (
      select 1 from public.enrollments e where e.user_id = a.user_id and e.course_id = v_c.exclude_buyers_of
        and e.revoked_at is null and e.source <> 'free'))
  on conflict do nothing;

  if v_c.include_contacts or v_pick is not null then
    insert into public.email_campaign_recipients (campaign_id, contact_id, email, name)
    select p_campaign, c.id, lower(c.email), nullif(trim(coalesce(c.first_name,'') || ' ' || coalesce(c.last_name,'')), '')
    from public.email_contacts c
    where c.unsubscribed_at is null
      and (v_pick is null or lower(c.email) = any (v_pick))
      and (v_pick is not null or v_groups is null or c.groups && v_groups)
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

drop function if exists public.campaign_recipient_count(text, uuid[], text[], boolean, boolean, uuid);
create or replace function public.campaign_recipient_count(
  p_kind text, p_courses uuid[] default null, p_countries text[] default null, p_buyers_only boolean default false,
  p_include_contacts boolean default false, p_exclude_buyers_of uuid default null,
  p_groups text[] default null, p_pick text[] default null)
returns int language sql stable security definer set search_path = public as $$
  with pick as (select array_agg(lower(x)) as emails from unnest(p_pick) x),
  students as (
    select lower(a.email) as email from public.campaign_audience(p_kind, p_courses, p_countries, p_buyers_only) a, pick
    where (pick.emails is null or lower(a.email) = any (pick.emails))
      and (p_exclude_buyers_of is null or not exists (
        select 1 from public.enrollments e where e.user_id = a.user_id and e.course_id = p_exclude_buyers_of
          and e.revoked_at is null and e.source <> 'free'))
  ), contacts as (
    select lower(c.email) as email from public.email_contacts c, pick
    where (p_include_contacts or pick.emails is not null) and c.unsubscribed_at is null
      and (pick.emails is null or lower(c.email) = any (pick.emails))
      and (pick.emails is not null or coalesce(cardinality(p_groups), 0) = 0 or c.groups && p_groups)
      and not exists (select 1 from public.profiles p where lower(p.email) = lower(c.email)
                        and (p.marketing_opt_in = false
                             or (p_exclude_buyers_of is not null and exists (
                                  select 1 from public.enrollments e where e.user_id = p.id and e.course_id = p_exclude_buyers_of
                                    and e.revoked_at is null and e.source <> 'free'))))
  )
  select count(*)::int from (select email from students union select email from contacts) x;
$$;
revoke all on function public.campaign_recipient_count(text, uuid[], text[], boolean, boolean, uuid, text[], text[]) from public, anon, authenticated;
grant execute on function public.campaign_recipient_count(text, uuid[], text[], boolean, boolean, uuid, text[], text[]) to service_role;
