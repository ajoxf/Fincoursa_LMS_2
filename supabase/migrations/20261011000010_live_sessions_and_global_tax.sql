-- ---------- Live masterclasses (Zoom) ----------
-- A live lesson has a scheduled time and a Zoom meeting. The join link lives in lesson_bodies
-- (only enrolled students can read it). After the session the recording is attached as a normal
-- video (video_asset_id), so buyers can replay it from their account.
alter table public.lessons
  add column if not exists starts_at timestamptz,
  add column if not exists live_minutes int check (live_minutes is null or live_minutes > 0),
  add column if not exists zoom_meeting_id text;          -- digits only; used to match Zoom recordings
create index if not exists lessons_starts_at_idx on public.lessons (starts_at) where starts_at is not null;
create index if not exists lessons_zoom_meeting_idx on public.lessons (zoom_meeting_id) where zoom_meeting_id is not null;

-- "What's included" bullet list shown on the course page (e.g. Live session + Q&A, recordings, community)
alter table public.courses add column if not exists highlights text[] not null default '{}';

-- ---------- Tax by buyer country ----------
-- One row per country. Only active rows are charged: switch a country on once FinCoursa is
-- registered there. reverse_charge: business buyers who give a tax ID are not charged
-- (they account for the tax themselves), as for B2B digital services in the EU/UK.
alter table public.tax_rates
  add column if not exists label text,                      -- short name on invoices: VAT, GST
  add column if not exists is_active boolean not null default true,
  add column if not exists reverse_charge boolean not null default false;
update public.tax_rates set label = coalesce(label, 'VAT');

alter table public.orders
  add column if not exists tax_name text,                    -- e.g. 'UAE VAT', 'India GST'
  add column if not exists billing_company text,
  add column if not exists billing_tax_id text,
  add column if not exists reverse_charge boolean not null default false;

-- Standard rates for digital services, OFF by default. Confirm with your tax adviser before
-- switching a country on; rates change, and some countries have registration thresholds.
insert into public.tax_rates (country_code, name, label, rate, prices_include_tax, is_active, reverse_charge) values
  ('SA','Saudi VAT','VAT',0.15,true,false,false), ('BH','Bahrain VAT','VAT',0.10,true,false,false),
  ('OM','Oman VAT','VAT',0.05,true,false,false),  ('EG','Egypt VAT','VAT',0.14,true,false,false),
  ('IN','India GST','GST',0.18,true,false,false), ('SG','Singapore GST','GST',0.09,true,false,false),
  ('AU','Australia GST','GST',0.10,true,false,false), ('NZ','New Zealand GST','GST',0.15,true,false,false),
  ('ZA','South Africa VAT','VAT',0.15,true,false,false), ('GB','UK VAT','VAT',0.20,true,false,true),
  ('NO','Norway VAT','VAT',0.25,true,false,true), ('CH','Swiss VAT','VAT',0.081,true,false,true),
  ('AT','Austria VAT','VAT',0.20,true,false,true), ('BE','Belgium VAT','VAT',0.21,true,false,true),
  ('BG','Bulgaria VAT','VAT',0.20,true,false,true), ('HR','Croatia VAT','VAT',0.25,true,false,true),
  ('CY','Cyprus VAT','VAT',0.19,true,false,true), ('CZ','Czechia VAT','VAT',0.21,true,false,true),
  ('DK','Denmark VAT','VAT',0.25,true,false,true), ('EE','Estonia VAT','VAT',0.24,true,false,true),
  ('FI','Finland VAT','VAT',0.255,true,false,true), ('FR','France VAT','VAT',0.20,true,false,true),
  ('DE','Germany VAT','VAT',0.19,true,false,true), ('GR','Greece VAT','VAT',0.24,true,false,true),
  ('HU','Hungary VAT','VAT',0.27,true,false,true), ('IE','Ireland VAT','VAT',0.23,true,false,true),
  ('IT','Italy VAT','VAT',0.22,true,false,true), ('LV','Latvia VAT','VAT',0.21,true,false,true),
  ('LT','Lithuania VAT','VAT',0.21,true,false,true), ('LU','Luxembourg VAT','VAT',0.17,true,false,true),
  ('MT','Malta VAT','VAT',0.18,true,false,true), ('NL','Netherlands VAT','VAT',0.21,true,false,true),
  ('PL','Poland VAT','VAT',0.23,true,false,true), ('PT','Portugal VAT','VAT',0.23,true,false,true),
  ('RO','Romania VAT','VAT',0.21,true,false,true), ('SK','Slovakia VAT','VAT',0.23,true,false,true),
  ('SI','Slovenia VAT','VAT',0.22,true,false,true), ('ES','Spain VAT','VAT',0.21,true,false,true),
  ('SE','Sweden VAT','VAT',0.25,true,false,true)
on conflict (country_code) do nothing;

-- Admins/finance need to see inactive rows too; buyers only ever get active ones via buildQuote (server).
