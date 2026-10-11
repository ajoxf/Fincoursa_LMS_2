-- Free-form tags on courses (in addition to the one category), shown as chips and catalog filters.
alter table public.courses add column if not exists tags text[] not null default '{}';
create index if not exists courses_tags_idx on public.courses using gin (tags);
