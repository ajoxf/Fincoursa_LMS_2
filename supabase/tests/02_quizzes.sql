-- Quizzes: answers are kept out of what students can read, grading and review still work.
-- Run after 01_end_to_end.sql. Fails loudly on any broken assertion.
\set ON_ERROR_STOP 1
reset role;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000b1', 'quiz-student@test'),
  ('00000000-0000-0000-0000-0000000000b2', 'quiz-other@test');
insert into public.lessons (id, course_id, chapter_id, title, type, is_preview)
select '00000000-0000-0000-0000-0000000000c1', c.course_id, c.id, 'Quiz', 'quiz', false
  from public.chapters c join public.courses co on co.id = c.course_id
 where co.slug = 'commodities-market-analysis' limit 1;
insert into public.enrollments (user_id, course_id, source)
select '00000000-0000-0000-0000-0000000000b1', course_id, 'admin' from public.lessons where id = '00000000-0000-0000-0000-0000000000c1';

-- ---- Saving a quiz the way the app does (answers on each question) ----
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);  -- admin
set role authenticated;
insert into public.lesson_bodies values ('00000000-0000-0000-0000-0000000000c1',
 '{"pass_pct":50,"questions":[{"id":"q1","prompt":"a","options":[{"id":"x","text":"X"},{"id":"y","text":"Y"}],"correct":"y"},
                              {"id":"q2","prompt":"b","options":[{"id":"m","text":"M"},{"id":"n","text":"N"}],"correct":"m"}]}');
do $$ begin
  assert (select answers from public.quiz_answer_keys where lesson_id = '00000000-0000-0000-0000-0000000000c1') = '{"q1":"y","q2":"m"}', 'answers stored in quiz_answer_keys';
  assert not (select body::text like '%correct%' from public.lesson_bodies where lesson_id = '00000000-0000-0000-0000-0000000000c1'), 'answers stripped from the body';
end $$;
reset role;

-- ---- Student: reads the body (no answers), not the key; grading and review work ----
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b1', false);
set role authenticated;
do $$ begin
  assert (select count(*) from public.lesson_bodies where lesson_id = '00000000-0000-0000-0000-0000000000c1') = 1, 'student reads the quiz body';
  assert (select count(*) from public.quiz_answer_keys) = 0, 'student cannot read answer keys';
  assert public.quiz_review('00000000-0000-0000-0000-0000000000c1') is null, 'no review before an attempt';
  begin
    insert into public.quiz_answer_keys values ('00000000-0000-0000-0000-0000000000c1', '{}');
    assert false, 'student must not write answer keys';
  exception when insufficient_privilege then null; end;
end $$;
-- separate statements: each attempt gets its own timestamp
select public.submit_quiz('00000000-0000-0000-0000-0000000000c1', '{"q1":"x","q2":"n"}');
select public.submit_quiz('00000000-0000-0000-0000-0000000000c1', '{"q1":"y","q2":"n"}');
do $$ declare r jsonb; begin
  r := public.quiz_review('00000000-0000-0000-0000-0000000000c1');
  assert r->'answers' = '{"q1":"y","q2":"n"}', 'review shows the latest attempt';
  assert (r->>'score')::numeric = 50 and (r->>'passed')::boolean, 'graded 1 of 2, passed at 50%';
  assert r->'key' = '{"q1":"y","q2":"m"}', 'review includes the answer key';
end $$;

-- ---- Someone without an attempt, or not logged in, gets no review ----
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b2', false);
do $$ begin assert public.quiz_review('00000000-0000-0000-0000-0000000000c1') is null, 'other user: no review'; end $$;
reset role;
set role anon;
do $$ begin
  begin perform public.quiz_review('00000000-0000-0000-0000-0000000000c1'); assert false, 'anon must not call quiz_review';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- ---- Admin edits: answers re-saved, unchanged on a text-only save, removed with the lesson ----
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
set role authenticated;
do $$ begin
  update public.lesson_bodies set body = body || '{"questions":[{"id":"q1","prompt":"a","options":[{"id":"x","text":"X"},{"id":"y","text":"Y"}],"correct":"x"},
     {"id":"q3","prompt":"c","options":[{"id":"s","text":"S"},{"id":"t","text":"T"}],"correct":"t"}]}'
   where lesson_id = '00000000-0000-0000-0000-0000000000c1';
  assert (select answers from public.quiz_answer_keys where lesson_id = '00000000-0000-0000-0000-0000000000c1') = '{"q1":"x","q3":"t"}', 'answers updated, removed question dropped';
  update public.lesson_bodies set body = body || '{"text":"hello"}' where lesson_id = '00000000-0000-0000-0000-0000000000c1';
  assert (select answers from public.quiz_answer_keys where lesson_id = '00000000-0000-0000-0000-0000000000c1') = '{"q1":"x","q3":"t"}', 'save without answers keeps them';
  delete from public.lessons where id = '00000000-0000-0000-0000-0000000000c1';
  assert (select count(*) from public.quiz_answer_keys where lesson_id = '00000000-0000-0000-0000-0000000000c1') = 0, 'answers removed with the lesson';
end $$;
reset role;
