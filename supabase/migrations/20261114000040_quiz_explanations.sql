-- Per-question explanations, shown to a student only after they submit a quiz (in review).
-- Like answer keys, they would give answers away, so they are kept out of lesson_bodies (which students can
-- read once a lesson is unlocked) and stored next to the key in quiz_answer_keys (admins only).
-- The app saves whole quiz bodies with "correct" and "explanation" on each question; the trigger moves
-- both out of the body. quiz_review returns the explanations with the key after a submission.

alter table public.quiz_answer_keys add column if not exists explanations jsonb not null default '{}'::jsonb;

create or replace function public.lesson_bodies_split_quiz_answers() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_old jsonb;
  v_new jsonb := '{}'::jsonb;
  v_old_ex jsonb;
  v_new_ex jsonb := '{}'::jsonb;
  v_q jsonb;
  v_id text;
  v_has_correct boolean := false;
  v_has_ex boolean := false;
begin
  if jsonb_typeof(new.body->'questions') is distinct from 'array' then return new; end if;

  select answers, explanations into v_old, v_old_ex from public.quiz_answer_keys where lesson_id = new.lesson_id;
  v_old := coalesce(v_old, '{}'::jsonb);
  v_old_ex := coalesce(v_old_ex, '{}'::jsonb);

  -- one key / explanation per current question: the one sent now, else the one already stored
  for v_q in select * from jsonb_array_elements(new.body->'questions') loop
    v_id := v_q->>'id';
    continue when v_id is null;
    if v_q ? 'correct' then
      v_has_correct := true;
      v_new := v_new || jsonb_build_object(v_id, coalesce(v_q->>'correct', ''));
    elsif v_old ? v_id then
      v_new := v_new || jsonb_build_object(v_id, v_old->v_id);
    end if;
    if v_q ? 'explanation' then
      v_has_ex := true;
      if nullif(btrim(coalesce(v_q->>'explanation', '')), '') is not null then
        v_new_ex := v_new_ex || jsonb_build_object(v_id, v_q->>'explanation');
      end if;
    elsif v_old_ex ? v_id then
      v_new_ex := v_new_ex || jsonb_build_object(v_id, v_old_ex->v_id);
    end if;
  end loop;

  if v_has_correct or v_has_ex or v_new <> v_old or v_new_ex <> v_old_ex then
    insert into public.quiz_answer_keys (lesson_id, answers, explanations) values (new.lesson_id, v_new, v_new_ex)
    on conflict (lesson_id) do update set answers = excluded.answers, explanations = excluded.explanations;
  end if;

  if v_has_correct or v_has_ex then
    new.body := jsonb_set(new.body, '{questions}', (
      select coalesce(jsonb_agg(q - 'correct' - 'explanation' order by n), '[]'::jsonb)
        from jsonb_array_elements(new.body->'questions') with ordinality as t(q, n)));
  end if;
  return new;
end $$;
revoke all on function public.lesson_bodies_split_quiz_answers() from public, anon, authenticated;

-- Review after submitting: also return the explanations.
create or replace function public.quiz_review(p_lesson uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_attempt public.quiz_attempts;
  v_keys public.quiz_answer_keys;
begin
  if auth.uid() is null or not coalesce(public.lesson_unlocked(p_lesson), false) then return null; end if;

  select * into v_attempt from public.quiz_attempts
   where user_id = auth.uid() and lesson_id = p_lesson
   order by created_at desc limit 1;
  if v_attempt.id is null then return null; end if;

  select * into v_keys from public.quiz_answer_keys where lesson_id = p_lesson;
  return jsonb_build_object(
    'answers', v_attempt.answers,
    'score', v_attempt.score,
    'passed', v_attempt.passed,
    'submitted_at', v_attempt.created_at,
    'key', coalesce(v_keys.answers, '{}'::jsonb),
    'explanations', coalesce(v_keys.explanations, '{}'::jsonb));
end $$;

revoke all on function public.quiz_review(uuid) from public, anon;
grant execute on function public.quiz_review(uuid) to authenticated;
