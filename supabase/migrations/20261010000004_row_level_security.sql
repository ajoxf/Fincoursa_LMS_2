-- =====================================================================
-- Row Level Security. The service role (server-only) bypasses RLS and
-- is used for webhooks, fulfilment and admin writes.
-- =====================================================================

alter table public.profiles              enable row level security;
alter table public.user_roles            enable row level security;
alter table public.instructors           enable row level security;
alter table public.categories            enable row level security;
alter table public.courses               enable row level security;
alter table public.course_instructors    enable row level security;
alter table public.video_assets          enable row level security;
alter table public.chapters              enable row level security;
alter table public.lessons               enable row level security;
alter table public.lesson_bodies         enable row level security;
alter table public.bundles               enable row level security;
alter table public.bundle_courses        enable row level security;
alter table public.prices                enable row level security;
alter table public.tax_rates             enable row level security;
alter table public.payment_routes        enable row level security;
alter table public.coupons               enable row level security;
alter table public.affiliates            enable row level security;
alter table public.affiliate_clicks      enable row level security;
alter table public.orders                enable row level security;
alter table public.order_items           enable row level security;
alter table public.payment_events        enable row level security;
alter table public.refunds               enable row level security;
alter table public.enrollments           enable row level security;
alter table public.lesson_progress       enable row level security;
alter table public.quiz_attempts         enable row level security;
alter table public.certificates          enable row level security;
alter table public.payouts               enable row level security;
alter table public.instructor_earnings   enable row level security;
alter table public.affiliate_commissions enable row level security;
alter table public.organizations         enable row level security;
alter table public.organization_members  enable row level security;
alter table public.organization_courses  enable row level security;
alter table public.contact_requests      enable row level security;
alter table public.audit_log             enable row level security;

-- Profiles & roles
create policy "own profile read"   on public.profiles for select using (id = auth.uid() or public.is_staff());
create policy "own profile update" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());
create policy "own roles read"     on public.user_roles for select using (user_id = auth.uid() or public.has_role('admin'));
create policy "admin manage roles" on public.user_roles for all using (public.has_role('admin')) with check (public.has_role('admin'));

-- Public catalog (published only); staff/instructors see drafts of their own
create policy "public instructors" on public.instructors for select using (is_published or user_id = auth.uid() or public.is_staff());
create policy "admin instructors"  on public.instructors for all using (public.has_role('admin')) with check (public.has_role('admin'));
create policy "instructor edits own bio" on public.instructors for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "public categories" on public.categories for select using (true);
create policy "admin categories"  on public.categories for all using (public.has_role('admin')) with check (public.has_role('admin'));

create policy "public courses" on public.courses for select
  using (status = 'published' or public.is_staff() or public.is_course_instructor(id));
create policy "admin courses" on public.courses for all using (public.has_role('admin')) with check (public.has_role('admin'));
create policy "instructor updates own course" on public.courses for update
  using (public.is_course_instructor(id)) with check (public.is_course_instructor(id));

create policy "public course instructors" on public.course_instructors for select using (true);
create policy "admin course instructors"  on public.course_instructors for all using (public.has_role('admin')) with check (public.has_role('admin'));

create policy "curriculum visible" on public.chapters for select
  using (exists (select 1 from public.courses c where c.id = course_id
                 and (c.status = 'published' or public.is_staff() or public.is_course_instructor(c.id))));
create policy "curriculum edit" on public.chapters for all
  using (public.has_role('admin') or public.is_course_instructor(course_id))
  with check (public.has_role('admin') or public.is_course_instructor(course_id));

create policy "lessons visible" on public.lessons for select
  using (exists (select 1 from public.courses c where c.id = course_id
                 and (c.status = 'published' or public.is_staff() or public.is_course_instructor(c.id))));
create policy "lessons edit" on public.lessons for all
  using (public.has_role('admin') or public.is_course_instructor(course_id))
  with check (public.has_role('admin') or public.is_course_instructor(course_id));

-- Lesson content only for enrolled students (or previews), after drip unlock
create policy "lesson body when unlocked" on public.lesson_bodies for select using (public.lesson_unlocked(lesson_id));
create policy "lesson body edit" on public.lesson_bodies for all
  using (public.has_role('admin') or public.is_course_instructor((select course_id from public.lessons where id = lesson_id)))
  with check (public.has_role('admin') or public.is_course_instructor((select course_id from public.lessons where id = lesson_id)));

-- Video assets: metadata readable by staff/creator; playback is via signed tokens from the server
create policy "video assets staff" on public.video_assets for select using (public.is_staff() or created_by = auth.uid());

create policy "public bundles" on public.bundles for select using (status = 'published' or public.is_staff());
create policy "admin bundles"  on public.bundles for all using (public.has_role('admin')) with check (public.has_role('admin'));
create policy "public bundle courses" on public.bundle_courses for select using (true);
create policy "admin bundle courses"  on public.bundle_courses for all using (public.has_role('admin')) with check (public.has_role('admin'));

create policy "public prices" on public.prices for select using (is_active or public.is_staff());
create policy "admin prices"  on public.prices for all using (public.has_role('admin')) with check (public.has_role('admin'));

create policy "public tax rates" on public.tax_rates for select using (true);
create policy "admin tax rates"  on public.tax_rates for all using (public.has_role('admin') or public.has_role('finance')) with check (public.has_role('admin') or public.has_role('finance'));
create policy "staff payment routes" on public.payment_routes for all using (public.has_role('admin') or public.has_role('finance')) with check (public.has_role('admin') or public.has_role('finance'));
create policy "staff coupons" on public.coupons for all using (public.has_role('admin') or public.has_role('finance')) with check (public.has_role('admin') or public.has_role('finance'));

-- Affiliates
create policy "own affiliate" on public.affiliates for select using (user_id = auth.uid() or public.is_staff());
create policy "apply as affiliate" on public.affiliates for insert
  with check (user_id = auth.uid() and status = 'pending');
create policy "admin affiliates" on public.affiliates for update using (public.has_role('admin')) with check (public.has_role('admin'));
create policy "own clicks" on public.affiliate_clicks for select
  using (public.is_staff() or affiliate_id in (select id from public.affiliates where user_id = auth.uid()));

-- Orders: buyers see their own; staff see all. Writes happen server-side with the service role.
create policy "own orders" on public.orders for select using (user_id = auth.uid() or public.is_staff());
create policy "own order items" on public.order_items for select
  using (exists (select 1 from public.orders o where o.id = order_id and (o.user_id = auth.uid() or public.is_staff())));
create policy "staff payment events" on public.payment_events for select using (public.has_role('admin') or public.has_role('finance'));
create policy "own refunds" on public.refunds for select
  using (public.is_staff() or exists (select 1 from public.orders o where o.id = order_id and o.user_id = auth.uid()));

-- Learning
create policy "own enrollments" on public.enrollments for select
  using (user_id = auth.uid() or public.is_staff() or public.is_course_instructor(course_id));
create policy "own progress" on public.lesson_progress for select
  using (user_id = auth.uid() or public.is_staff() or public.is_course_instructor(course_id));
create policy "own quiz attempts" on public.quiz_attempts for select
  using (user_id = auth.uid() or public.is_staff()
         or public.is_course_instructor((select course_id from public.lessons where id = lesson_id)));
create policy "certificates" on public.certificates for select using (user_id = auth.uid() or public.is_staff());

-- Earnings & payouts
create policy "own instructor earnings" on public.instructor_earnings for select
  using (public.has_role('admin') or public.has_role('finance')
         or instructor_id in (select id from public.instructors where user_id = auth.uid()));
create policy "own affiliate commissions" on public.affiliate_commissions for select
  using (public.has_role('admin') or public.has_role('finance')
         or affiliate_id in (select id from public.affiliates where user_id = auth.uid()));
create policy "own payouts" on public.payouts for select
  using (public.has_role('admin') or public.has_role('finance')
         or instructor_id in (select id from public.instructors where user_id = auth.uid())
         or affiliate_id in (select id from public.affiliates where user_id = auth.uid()));

-- Organizations (helpers avoid recursive policies on organization_members)
create or replace function public.org_role(p_org uuid) returns text
language sql stable security definer set search_path = public as $$
  select role from public.organization_members where organization_id = p_org and user_id = auth.uid();
$$;
create policy "org visible to members" on public.organizations for select
  using (public.is_staff() or public.org_role(id) is not null);
create policy "org members visible to managers" on public.organization_members for select
  using (public.is_staff() or user_id = auth.uid() or public.org_role(organization_id) = 'manager');
create policy "org courses visible" on public.organization_courses for select
  using (public.is_staff() or public.org_role(organization_id) is not null);

-- Leads: anyone can submit (via server action), staff read
create policy "staff read contact" on public.contact_requests for select using (public.is_staff());
create policy "staff read audit" on public.audit_log for select using (public.has_role('admin'));
