-- Free enrolments follow the course's access period (courses.access_days), like purchases already do.
-- Before this, enrolling in a free course always gave lifetime access.
-- Re-enrolling renews access the same way a repeat purchase does: lifetime stays lifetime, otherwise
-- the later expiry wins, so a student whose free access ran out can enrol again.

create or replace function public.enroll_free(p_course uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if not exists (select 1 from public.courses c where c.id = p_course and c.status = 'published')
     or exists (select 1 from public.prices p where p.course_id = p_course and p.is_active and p.amount_minor > 0) then
    raise exception 'course is not free';
  end if;
  insert into public.enrollments (user_id, course_id, source, expires_at)
  select auth.uid(), p_course, 'free',
         case when c.access_days is null or c.access_days <= 0 then null else now() + make_interval(days => c.access_days) end
    from public.courses c where c.id = p_course
  on conflict (user_id, course_id) do update
     set revoked_at = null,
         expires_at = case when public.enrollments.expires_at is null or excluded.expires_at is null then null
                           else greatest(public.enrollments.expires_at, excluded.expires_at) end;
end $$;
