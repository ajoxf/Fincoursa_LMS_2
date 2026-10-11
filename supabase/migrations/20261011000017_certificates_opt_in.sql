-- Certificates are opt-in per course (Admin → Courses → course → "Issue a certificate on completion").
alter table public.courses alter column certificate_enabled set default false;
-- FinCoursa courses don't issue certificates today; admins switch them on per course.
update public.courses set certificate_enabled = false where certificate_enabled;
