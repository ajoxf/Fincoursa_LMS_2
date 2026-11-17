-- "Coming soon" programmes: shown on the site before launch; they can't be bought or enrolled in, and visitors can
-- leave their email (stored in contact_requests, like coming-soon courses).
alter table public.bundles
  add column if not exists coming_soon boolean not null default false,
  add column if not exists launch_note text;
alter table public.contact_requests
  add column if not exists bundle_id uuid references public.bundles(id) on delete set null;
