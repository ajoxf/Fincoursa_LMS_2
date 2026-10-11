-- Seed data mirroring the current fincoursa.com catalog (content as on the live site, Oct 2026).
-- Images still point at the Thinkific CDN; re-host them in Supabase Storage before switching off Thinkific.

insert into public.tax_rates (country_code, name, rate, prices_include_tax) values
  ('AE', 'UAE VAT', 0.05, true)
on conflict (country_code) do nothing;

-- Default routing: one catch-all route to the built-in test gateway.
-- Replace/add rows per region once real gateways are configured (e.g. AE -> telr, * -> stripe).
insert into public.payment_routes (country_code, currency, gateway, priority) values
  (null, null, 'manual', 1000);

insert into public.categories (slug, name, sort_order) values
  ('technical-finance', 'Technical Finance', 1)
on conflict (slug) do nothing;

insert into public.instructors (slug, name, title, photo_url, org_logo_url, sort_order) values
  ('dean-rogers', 'Dean Rogers, CMT', 'President, Kase and Company',
   'https://import.cdn.thinkific.com/1229196/custom_site_themes/id/HuQCUF6DRo2ypIjWDair_Gemini_Generated_Image_321uby321uby321u.jpg',
   'https://import.cdn.thinkific.com/1229196/custom_site_themes/id/wOm4PExeRyGOJWdSsf7E_kase_logo_white_1x.png', 1),
  ('nicholas-roper', 'Nicholas Roper', 'Global Wealth Management and Investment Strategy Specialist',
   'https://import.cdn.thinkific.com/1229196/custom_site_themes/id/WwKi14m5Sca2Bk3CxERn_Gemini_Generated_Image_timwkqtimwkqtimw.jpg', null, 2),
  ('tom-robson', 'Tom Robson', 'Head of Sales',
   'https://import.cdn.thinkific.com/1229196/custom_site_themes/id/9kOpHoGeRTOjfXYMwm86_Gemini_Generated_Image_grs39mgrs39mgrs3.jpg',
   'https://import.cdn.thinkific.com/1229196/custom_site_themes/id/ukdzLy2HS6eKuc6rzVWx_okx_wordmark_white.png', 3)
on conflict (slug) do nothing;

with cat as (select id from public.categories where slug = 'technical-finance')
insert into public.courses (slug, title, description, category_id, duration_minutes, status, is_featured, published_at, sort_order)
select v.slug, v.title, v.description, cat.id, 10, 'published', true, now(), v.ord
from cat, (values
  ('behavioral-chemistry-of-trading', 'Behavioral Chemistry of Trading',
   'Explore the psychological and chemical influences that drive trading decisions and behaviour.', 1),
  ('commodities-market-analysis', 'Commodities Market Analysis',
   'Analyse commodities markets with the tools and frameworks used by professional traders.', 2),
  ('technical-analysis-theory-and-history', 'Technical Analysis: Theory and History',
   'The foundations and history of technical analysis, from its origins to modern practice.', 3)
) as v(slug, title, description, ord)
on conflict (slug) do nothing;

insert into public.course_instructors (course_id, instructor_id, is_primary)
select c.id, i.id, true from public.courses c join public.instructors i on
  (c.slug, i.slug) in (('behavioral-chemistry-of-trading','nicholas-roper'),
                       ('commodities-market-analysis','dean-rogers'),
                       ('technical-analysis-theory-and-history','tom-robson'))
on conflict do nothing;

-- Placeholder prices (AED). Replace with real prices during migration.
insert into public.prices (course_id, type, currency, amount_minor)
select id, 'one_time', 'AED', 36700 from public.courses
where slug in ('behavioral-chemistry-of-trading','commodities-market-analysis','technical-analysis-theory-and-history')
  and not exists (select 1 from public.prices p where p.course_id = courses.id);

-- One chapter + intro lesson per course so the player has something to show
insert into public.chapters (course_id, title, position)
select id, 'Introduction', 1 from public.courses
where not exists (select 1 from public.chapters ch where ch.course_id = courses.id);

insert into public.lessons (course_id, chapter_id, title, type, position, is_preview, duration_seconds)
select ch.course_id, ch.id, 'Welcome to the course', 'video', 1, true, 600 from public.chapters ch
where not exists (select 1 from public.lessons l where l.chapter_id = ch.id);

insert into public.bundles (slug, title, description, status, is_featured)
values ('technical-analysis-track', 'Technical Analysis Track',
        'A structured path through technical analysis, from theory to application.', 'published', true)
on conflict (slug) do nothing;

insert into public.bundle_courses (bundle_id, course_id, position)
select b.id, c.id, 1 from public.bundles b, public.courses c
where b.slug = 'technical-analysis-track' and c.slug = 'technical-analysis-theory-and-history'
on conflict do nothing;

-- The live site shows this bundle as "Free"
insert into public.prices (bundle_id, type, currency, amount_minor)
select id, 'free', 'AED', 0 from public.bundles b where slug = 'technical-analysis-track'
  and not exists (select 1 from public.prices p where p.bundle_id = b.id);
update public.instructors set bio = 'Experienced financial leader serving as Chief Investment Officer & Head of Wealth Management for a Single Family Office across Dubai, London, and New York. Specializes in investment strategies, estate planning, market analysis, and global fund selection. Currently leads Banking, Wealth, and M&A at Emerald Group, bringing deep expertise across asset management, private equity, and venture capital. A seasoned advisor and former steering committee member with a strong track record in FinTech, Blockchain, and regulatory frameworks, consulting for top-tier global firms and institutions.'
 where slug = 'nicholas-roper' and bio is null;
