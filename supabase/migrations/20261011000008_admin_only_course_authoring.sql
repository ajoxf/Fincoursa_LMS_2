-- Course authoring is admin-only (as on Thinkific): instructors can see their own courses,
-- including drafts, and the progress/earnings reports, but cannot edit, upload or publish.

drop policy if exists "instructor updates own course" on public.courses;

drop policy if exists "curriculum edit" on public.chapters;
create policy "curriculum edit" on public.chapters for all
  using (public.has_role('admin')) with check (public.has_role('admin'));

drop policy if exists "lessons edit" on public.lessons;
create policy "lessons edit" on public.lessons for all
  using (public.has_role('admin')) with check (public.has_role('admin'));

drop policy if exists "lesson body edit" on public.lesson_bodies;
create policy "lesson body edit" on public.lesson_bodies for all
  using (public.has_role('admin')) with check (public.has_role('admin'));
