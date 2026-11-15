-- Feedback and reviews from buyers. A review on an order lets the admin top that order's cashback
-- up to the review rate (Admin -> Credit). Only the server (service role) reads or writes this table.
create table if not exists public.course_reviews (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  feedback text not null check (char_length(feedback) between 20 and 4000),
  review text not null check (char_length(review) between 20 and 1500),
  can_publish boolean not null default false,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  decided_at timestamptz,
  decided_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists course_reviews_course_status on public.course_reviews (course_id, status);
create index if not exists course_reviews_status on public.course_reviews (status, created_at);
alter table public.course_reviews enable row level security;
revoke all on public.course_reviews from anon, authenticated;

-- when the "share feedback and a review" reminder was emailed for an order
alter table public.orders add column if not exists review_invite_sent_at timestamptz;
