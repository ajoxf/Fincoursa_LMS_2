-- Access periods: a course's access_days sets how long enrolments last, for free enrolments as well as purchases.
-- Run after 02_quizzes.sql. Fails loudly on any broken assertion.
\set ON_ERROR_STOP 1
reset role;

insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000d1', 'access-student@test');

-- the free seed course, with a 90-day access period
update public.courses set access_days = 90 where slug = 'behavioral-chemistry-of-trading';

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000d1', false);
set role authenticated;
select public.enroll_free((select id from public.courses where slug = 'behavioral-chemistry-of-trading'));
do $$ declare v_exp timestamptz; begin
  select expires_at into v_exp from public.enrollments
   where course_id = (select id from public.courses where slug = 'behavioral-chemistry-of-trading');
  assert v_exp between now() + interval '89 days 23 hours' and now() + interval '90 days 1 hour', 'free enrolment lasts 90 days';
  assert public.has_course_access((select id from public.courses where slug = 'behavioral-chemistry-of-trading')), 'access while the period runs';
end $$;
reset role;

-- once access has run out, the student loses it and can enrol again for a fresh period
update public.enrollments set expires_at = now() - interval '1 day'
 where user_id = '00000000-0000-0000-0000-0000000000d1';
set role authenticated;
do $$ begin
  assert not public.has_course_access((select id from public.courses where slug = 'behavioral-chemistry-of-trading')), 'no access after expiry';
end $$;
select public.enroll_free((select id from public.courses where slug = 'behavioral-chemistry-of-trading'));
do $$ begin
  assert (select expires_at from public.enrollments
           where course_id = (select id from public.courses where slug = 'behavioral-chemistry-of-trading')) > now() + interval '89 days', 're-enrolling renews access';
end $$;
reset role;

-- a lifetime enrolment stays lifetime when the student enrols again
update public.enrollments set expires_at = null where user_id = '00000000-0000-0000-0000-0000000000d1';
set role authenticated;
select public.enroll_free((select id from public.courses where slug = 'behavioral-chemistry-of-trading'));
do $$ begin
  assert (select expires_at from public.enrollments
           where course_id = (select id from public.courses where slug = 'behavioral-chemistry-of-trading')) is null, 'lifetime is kept';
end $$;
reset role;

-- with no access period set, free enrolment is lifetime
update public.courses set access_days = null where slug = 'behavioral-chemistry-of-trading';
delete from public.enrollments where user_id = '00000000-0000-0000-0000-0000000000d1';
set role authenticated;
select public.enroll_free((select id from public.courses where slug = 'behavioral-chemistry-of-trading'));
do $$ begin
  assert (select expires_at from public.enrollments
           where course_id = (select id from public.courses where slug = 'behavioral-chemistry-of-trading')) is null, 'no period = lifetime';
end $$;
reset role;
