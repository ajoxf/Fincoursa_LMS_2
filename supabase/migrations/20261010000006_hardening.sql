-- Least privilege for the public API (from the Supabase security advisor).
-- Signed-out visitors may only call what the public site needs: click tracking and the
-- helpers used inside row-level-security policies. Everything else needs a signed-in user,
-- and each function still checks the caller's role itself.

revoke execute on function
  public.admin_kpis(timestamptz, timestamptz, char),
  public.admin_revenue_series(timestamptz, timestamptz, char),
  public.admin_revenue_breakdown(text, timestamptz, timestamptz, char),
  public.admin_affiliate_stats(),
  public.affiliate_dashboard(int),
  public.affiliate_clients(int),
  public.affiliate_statement(int),
  public.current_affiliate(),
  public.complete_lesson(uuid),
  public.course_progress_report(uuid),
  public.course_progress_buckets(uuid),
  public.enroll_free(uuid),
  public.instructor_summary(char),
  public.instructor_earnings_series(int, char),
  public.organization_progress(uuid),
  public.record_video_progress(uuid, int, int),
  public.submit_quiz(uuid, jsonb)
from public, anon;

-- Trigger function: never callable through the API
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- Fixed search paths
alter function public.touch_updated_at() set search_path = public;
alter function public.mask_name(text, text) set search_path = public;
alter function public.mask_email(text) set search_path = public;
