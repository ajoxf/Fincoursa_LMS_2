-- Practice mode: a student checks one question at a time and sees its answer and explanation right away.
-- Practice answers are never submitted, so they don't change scores, passing or progress.
-- Only students with access to an unlocked quiz lesson can check, one question per call.
create or replace function public.quiz_check(p_lesson uuid, p_question text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_course uuid; v_keys public.quiz_answer_keys;
begin
  if auth.uid() is null then return null; end if;
  select course_id into v_course from public.lessons where id = p_lesson and type = 'quiz';
  if v_course is null or not coalesce(public.lesson_unlocked(p_lesson), false) or not public.has_course_access(v_course) then
    return null;
  end if;
  select * into v_keys from public.quiz_answer_keys where lesson_id = p_lesson;
  if v_keys.lesson_id is null or not (v_keys.answers ? p_question) then return null; end if;
  return jsonb_build_object(
    'correct', v_keys.answers->>p_question,
    'explanation', coalesce(v_keys.explanations->>p_question, ''));
end $$;

revoke all on function public.quiz_check(uuid, text) from public, anon;
grant execute on function public.quiz_check(uuid, text) to authenticated;
