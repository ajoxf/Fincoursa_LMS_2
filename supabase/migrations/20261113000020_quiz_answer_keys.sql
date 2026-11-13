-- Quiz answer keys are kept out of lesson_bodies.
--
-- Students can read a lesson's body once it is unlocked (RLS "lesson body when unlocked"), and the
-- browser holds their session, so anything in the body is readable with the public API key. The
-- correct answers used to live there too (questions[].correct). They now live in quiz_answer_keys,
-- which only admins can read; grading (submit_quiz) reads them as security definer.
--
-- The app keeps saving whole quiz bodies with "correct" on each question: a trigger moves those
-- answers into quiz_answer_keys and strips them from the body before it is stored.

create table public.quiz_answer_keys (
  lesson_id uuid primary key references public.lessons(id) on delete cascade,
  answers jsonb not null default '{}'::jsonb  -- { "<question id>": "<correct option id>" }
);
alter table public.quiz_answer_keys enable row level security;
create policy "quiz keys admin" on public.quiz_answer_keys for all
  using (public.has_role('admin')) with check (public.has_role('admin'));
revoke all on public.quiz_answer_keys from anon;

create or replace function public.lesson_bodies_split_quiz_answers() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_old jsonb;
  v_new jsonb := '{}'::jsonb;
  v_q jsonb;
  v_has_correct boolean := false;
begin
  if jsonb_typeof(new.body->'questions') is distinct from 'array' then return new; end if;

  select answers into v_old from public.quiz_answer_keys where lesson_id = new.lesson_id;
  v_old := coalesce(v_old, '{}'::jsonb);

  -- one key per current question: the answer sent now, else the one already stored
  for v_q in select * from jsonb_array_elements(new.body->'questions') loop
    continue when v_q->>'id' is null;
    if v_q ? 'correct' then
      v_has_correct := true;
      v_new := v_new || jsonb_build_object(v_q->>'id', coalesce(v_q->>'correct', ''));
    elsif v_old ? (v_q->>'id') then
      v_new := v_new || jsonb_build_object(v_q->>'id', v_old->(v_q->>'id'));
    end if;
  end loop;

  if v_has_correct or v_new <> v_old then
    insert into public.quiz_answer_keys (lesson_id, answers) values (new.lesson_id, v_new)
    on conflict (lesson_id) do update set answers = excluded.answers;
  end if;

  if v_has_correct then
    new.body := jsonb_set(new.body, '{questions}', (
      select coalesce(jsonb_agg(q - 'correct' order by n), '[]'::jsonb)
        from jsonb_array_elements(new.body->'questions') with ordinality as t(q, n)));
  end if;
  return new;
end $$;
revoke all on function public.lesson_bodies_split_quiz_answers() from public, anon, authenticated;

create trigger lesson_bodies_split_quiz_answers
  before insert or update on public.lesson_bodies
  for each row execute function public.lesson_bodies_split_quiz_answers();

-- Move the answers already stored in quiz bodies (the trigger does the work).
update public.lesson_bodies set body = body
 where exists (select 1 from jsonb_array_elements(case when jsonb_typeof(body->'questions') = 'array' then body->'questions' else '[]'::jsonb end) q
               where q ? 'correct');

-- Grading reads the answer key.
create or replace function public.submit_quiz(p_lesson uuid, p_answers jsonb)
returns table (score numeric, passed boolean)
language plpgsql security definer set search_path = public as $$
declare
  v_course uuid; v_body jsonb; v_key jsonb; v_q jsonb; v_total int := 0; v_right int := 0; v_pass numeric; v_score numeric;
begin
  select l.course_id, b.body into v_course, v_body
    from public.lessons l join public.lesson_bodies b on b.lesson_id = l.id
   where l.id = p_lesson and l.type = 'quiz';
  if v_course is null then raise exception 'quiz not found'; end if;
  if not public.lesson_unlocked(p_lesson) or not public.has_course_access(v_course) then raise exception 'no access'; end if;
  select answers into v_key from public.quiz_answer_keys where lesson_id = p_lesson;
  v_key := coalesce(v_key, '{}'::jsonb);

  for v_q in select * from jsonb_array_elements(coalesce(v_body->'questions', '[]'::jsonb)) loop
    v_total := v_total + 1;
    if nullif(v_key->>(v_q->>'id'), '') is not null and p_answers->>(v_q->>'id') = v_key->>(v_q->>'id') then
      v_right := v_right + 1;
    end if;
  end loop;
  v_pass := coalesce((v_body->>'pass_pct')::numeric, 70);
  v_score := case when v_total = 0 then 100 else round(100.0 * v_right / v_total, 2) end;

  insert into public.quiz_attempts (user_id, lesson_id, answers, score, passed)
  values (auth.uid(), p_lesson, p_answers, v_score, v_score >= v_pass);

  if v_score >= v_pass then
    insert into public.lesson_progress (user_id, lesson_id, course_id, completed_at)
    values (auth.uid(), p_lesson, v_course, now())
    on conflict (user_id, lesson_id) do update set completed_at = coalesce(public.lesson_progress.completed_at, now()), updated_at = now();
    perform public.recompute_enrollment(auth.uid(), v_course);
  end if;
  return query select v_score, v_score >= v_pass;
end $$;
