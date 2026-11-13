-- Quiz review: after submitting, a student sees each question with their answer, whether it was right,
-- and the correct answer. quiz_answer_keys stays admin-only; this returns the key only to a student who
-- has submitted the quiz and still has access to the lesson, together with their latest attempt.

create or replace function public.quiz_review(p_lesson uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_attempt public.quiz_attempts;
begin
  if auth.uid() is null or not coalesce(public.lesson_unlocked(p_lesson), false) then return null; end if;

  select * into v_attempt from public.quiz_attempts
   where user_id = auth.uid() and lesson_id = p_lesson
   order by created_at desc limit 1;
  if v_attempt.id is null then return null; end if;

  return jsonb_build_object(
    'answers', v_attempt.answers,
    'score', v_attempt.score,
    'passed', v_attempt.passed,
    'submitted_at', v_attempt.created_at,
    'key', coalesce((select answers from public.quiz_answer_keys where lesson_id = p_lesson), '{}'::jsonb));
end $$;

revoke all on function public.quiz_review(uuid) from public, anon;
grant execute on function public.quiz_review(uuid) to authenticated;
