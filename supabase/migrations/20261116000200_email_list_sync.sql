-- Whether a profile's marketing consent has been copied to the Resend contact list
-- (true = in the list, false = marked unsubscribed there, null = never synced).
alter table public.profiles add column if not exists email_list_synced boolean;
