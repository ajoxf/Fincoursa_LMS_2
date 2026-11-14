-- "Coming soon": a published course or instructor can be shown on the site before launch.
-- Coming-soon courses can't be bought or enrolled in; visitors can leave their email (stored in contact_requests).
alter table public.courses
  add column if not exists coming_soon boolean not null default false,
  add column if not exists launch_note text;
alter table public.instructors
  add column if not exists coming_soon boolean not null default false;
