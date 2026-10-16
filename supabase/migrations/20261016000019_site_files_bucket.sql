-- Public files for the site itself, e.g. the PDF versions of the Terms & Conditions and Privacy Policy.
-- Uploads go through server-signed URLs after an admin check (no client insert policies).
do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('site-files', 'site-files', true, 20971520, array['application/pdf'])
    on conflict (id) do nothing;
  end if;
end $$;
