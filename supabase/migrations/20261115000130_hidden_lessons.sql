-- Hide a lesson from students (e.g. a quiz whose questions aren't ready yet) without deleting it.
-- Hidden lessons don't appear on the course page or in the course player, and don't count toward completion.
-- Admin → Courses → a course → a lesson → "Hidden from students".
alter table public.lessons add column if not exists is_hidden boolean not null default false;

-- progress counts only lessons students can see (unchanged otherwise)
create or replace function public.recompute_enrollment(p_user uuid, p_course uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_required int; v_done int; v_pct numeric; v_course record; v_name text;
begin
  select count(*) into v_required from public.lessons where course_id = p_course and is_required and not is_hidden;
  select count(*) into v_done from public.lesson_progress lp
    join public.lessons l on l.id = lp.lesson_id
    where lp.user_id = p_user and lp.course_id = p_course and l.is_required and not l.is_hidden and lp.completed_at is not null;
  v_pct := case when v_required = 0 then 0 else round(100.0 * v_done / v_required, 2) end;

  update public.enrollments
     set progress_pct = v_pct,
         last_activity_at = now(),
         completed_at = case when v_pct >= 100 then coalesce(completed_at, now()) else null end
   where user_id = p_user and course_id = p_course;

  select * into v_course from public.courses where id = p_course;
  if v_pct >= 100 and v_course.certificate_enabled then
    select coalesce(nullif(full_name,''), email::text) into v_name from public.profiles where id = p_user;
    insert into public.certificates (user_id, course_id, recipient_name)
    values (p_user, p_course, coalesce(v_name, 'Student'))
    on conflict (user_id, course_id) do nothing;
  end if;
end $$;
