# FinCoursa LMS

The platform replacing Thinkific for **fincoursa.com**: course catalog, checkout, course player, and
revenue & progress dashboards for students, instructors, affiliates and admins.

**Stack:** Next.js 16 (App Router) on Vercel · Supabase (Postgres, Auth, Storage) · Mux (video) ·
pluggable payment gateways (Stripe included; regional gateways added through one interface).

> **Design:** the page structure, sections, navigation, URLs and copy mirror the live fincoursa.com.
> Colours, fonts and radii are placeholders in **one file**, `src/app/theme.css`, to be replaced with the
> exact values from the Thinkific theme. See [docs/DESIGN_HANDOFF.md](docs/DESIGN_HANDOFF.md).

## What's in it

| Area | Highlights |
|---|---|
| Public site | Same pages and URLs as today: `/`, `/pages/paid-courses`, `/pages/free-courses`, `/pages/bundles`, `/pages/instructors`, `/pages/contact-us`, `/courses/:slug`, `/bundles/:slug`, `/users/sign_in` |
| Checkout | Server-side pricing, coupons, UAE VAT (5%, tax-inclusive), country-based gateway routing, free enrolment, idempotent webhooks, printable tax invoices |
| Course player | Signed Mux playback, resume where you left off, watch-time based completion (seeking doesn't count), quizzes graded on the server, drip unlocks, file downloads via signed URLs, email watermark |
| Student | My courses with progress, continue button, purchases & invoices, certificates with a public verification page |
| Instructor | Earnings (pending / ready / paid), daily earnings chart, students and average progress per course, completion rate, lesson-by-lesson drop-off, course builder with direct video upload |
| Affiliate | Application → approval, referral link builder, clicks → sales → commission, pending / ready / paid |
| Admin | Net revenue, VAT, refunds, revenue by course / channel / gateway / country, orders & refunds, affiliate approvals, payout batches, leads |
| Course authoring (admin) | Create a course → details, thumbnail upload, category, level, access length, SEO → prices (several currencies, compare-at price) → instructors with revenue share → curriculum: chapters and lessons with reorder, video upload to Mux, PDF/download uploads, visual quiz builder, free previews, drip unlocks → publish. Bundles (courses, price, image) and instructor profiles (photo, logo, bio, linked login) are managed the same way |

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in what you have; the public site runs in demo mode without Supabase
npm run dev
```

Without Supabase variables the public pages render from built-in demo content, so the site can be
previewed straight away. Sign-in, checkout and dashboards need Supabase.

### Database

Migrations are in `supabase/migrations`, demo/seed content in `supabase/seed.sql`.

```bash
npx supabase link --project-ref <ref>
npx supabase db push            # applies the migrations
psql "$DATABASE_URL" -f supabase/seed.sql   # optional: current catalog as seed data
```

Make yourself admin after signing up once:

```sql
insert into user_roles (user_id, role) select id, 'admin' from auth.users where email = 'you@example.com';
```

Storage buckets `course-images` (public) and `course-files` (private) are created by the migrations.

### Tests

The database logic (fulfilment, progress, certificates, earnings, commissions, refunds, reports, and
row-level security) has an end-to-end test that runs on plain Postgres 15+:

```bash
PGHOST=localhost PGUSER=postgres supabase/tests/run.sh
```

### Webhooks to configure

| Service | URL |
|---|---|
| Mux | `https://<site>/api/webhooks/mux` |
| Stripe | `https://<site>/api/webhooks/payments/stripe` (events: `checkout.session.*`, `refund.created`, `refund.updated`) |
| Any new gateway | `https://<site>/api/webhooks/payments/<gateway-id>` |

## Docs

- [Architecture](docs/ARCHITECTURE.md): modules, data model, money flow, security
- [Payments](docs/PAYMENTS.md): adding a regional gateway
- [Design handoff](docs/DESIGN_HANDOFF.md): matching the live site's styling exactly
- [Migration from Thinkific](docs/MIGRATION_FROM_THINKIFIC.md): data, URLs, cut-over
- [Content](docs/CONTENT.md): lesson types, quiz format, downloads
