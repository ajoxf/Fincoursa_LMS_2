-- Storage buckets (Supabase only; skipped on plain Postgres test runs).
--   course-images : public  — course/bundle thumbnails, instructor photos and logos
--   course-files  : private — lesson PDFs and downloads, served through 1-hour signed links
-- Uploads go through short-lived signed upload URLs issued by the server after a role check,
-- so no insert/update policies are granted to browser roles.
do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit)
    values ('course-images', 'course-images', true, 10485760),        -- 10 MB
           ('course-files',  'course-files',  false, 524288000)       -- 500 MB
    on conflict (id) do nothing;
  end if;
end $$;
