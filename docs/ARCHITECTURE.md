# Architecture

## Overview

```
Browser ──► Vercel (Next.js 16)
              │  src/proxy.ts            session refresh, affiliate ?ref= tracking
              │  Server Components       pages read via Supabase with the user's session (RLS)
              │  Server Actions          checkout, enrol, curriculum edits, admin actions
              │  Route handlers          /api/webhooks/{mux,payments/:gateway}, /api/invoices, /api/cron
              ▼
           Supabase Postgres ── business rules live in SQL functions (atomic, idempotent, tested)
           Supabase Auth     ── email+password and magic links
           Supabase Storage  ── private `course-files` bucket
           Mux               ── direct uploads, signed HLS playback, viewer analytics
           Payment gateways  ── one adapter each, chosen per country/currency
```

## Roles

`student` (everyone), `instructor`, `affiliate`, `admin`, `finance`, `support`, stored in `user_roles`
(a user can hold several). Organisation managers (B2B teams/universities) are modelled through
`organization_members.role = 'manager'`.

## Data model (main tables)

- **Catalog:** `courses`, `chapters`, `lessons` (public metadata), `lesson_bodies` (protected content),
  `bundles`, `bundle_courses`, `prices` (many per product: currency / plan), `instructors`, `course_instructors`
  (revenue share per course), `video_assets`
- **Commerce:** `orders`, `order_items`, `payment_events` (raw webhooks, unique per provider event),
  `refunds`, `coupons`, `tax_rates`, `payment_routes`
- **Learning:** `enrollments` (progress %, last lesson, expiry, revocation), `lesson_progress`
  (watched seconds, position, completion), `quiz_attempts`, `certificates`
- **Earnings:** `instructor_earnings`, `affiliate_commissions`, `payouts`, plus `affiliates` and `affiliate_clicks`
- **B2B & ops:** `organizations`, `organization_members`, `organization_courses`, `contact_requests`, `audit_log`

Money is always stored in minor units (`bigint`) alongside an ISO currency.

## Money flow

1. Checkout computes the price on the server (`lib/checkout.ts`): price → coupon → VAT.
2. An order (`pending`) is created and the buyer is sent to the gateway chosen by `payment_routes`.
3. The gateway webhook is verified, stored once in `payment_events`, then `fulfill_order()` runs
   in a single transaction. It marks the order paid, enrols the buyer (bundles expand to their courses),
   creates instructor earnings (net of VAT; bundle revenue split equally across its courses) and the
   affiliate commission (no self-referrals). It also counts the coupon use. Re-running it is a no-op.
4. Earnings stay `pending` for the 30-day refund window, then a daily cron moves them to `approved`.
5. Admin creates a payout batch (grouped per payee and currency) and marks each payout paid with a bank reference.
6. `apply_refund()`: a full refund revokes access and reverses unpaid earnings and commissions.
   A partial refund scales them down.

## Progress tracking

The player sends a heartbeat every 15s (and on pause, end, or tab hide) with the seconds **actually played**.
Seeks are excluded on the client, and the server caps each beat at 30s, so scrubbing to the end doesn't
complete a lesson. A video lesson completes at 90% of its duration (configurable per lesson). Text and
download lessons complete via "Mark as complete". Quizzes are graded in SQL, and the answers never reach
the browser. `recompute_enrollment()` keeps `enrollments.progress_pct` current and issues the certificate at 100%.

## Reporting

All dashboard numbers come from SQL functions that check the caller's role first:
`admin_kpis`, `admin_revenue_series`, `admin_revenue_breakdown(course|channel|gateway|country)`,
`instructor_summary`, `instructor_earnings_series`, `course_progress_report`, `course_progress_buckets`,
`affiliate_summary`, `organization_progress`.

## Security

- Row-level security on every table. The browser only ever uses the anon key plus the user's session.
- The service-role key is used only in server code: webhooks, fulfilment, and admin actions after a role check.
- `fulfill_order`, `apply_refund`, `release_matured_earnings` cannot be executed by `anon`/`authenticated`.
- Lesson content (`lesson_bodies`) is readable only when the lesson is unlocked for that user.
  Video tokens are signed only after the same check, expire after 4h, and carry the viewer id.
- Webhooks verify provider signatures. Events are de-duplicated by `(gateway, event_id)`.
- Security headers in `next.config.ts`. Redirect targets after login are restricted to same-site paths.

## Scaling notes

- Video delivery is entirely on Mux's CDN. App servers never proxy video bytes.
- Progress writes are one small upsert per 15s per active viewer. Add a read replica or batch heartbeats if
  concurrent viewers grow into the tens of thousands.
- Reporting functions aggregate on the fly. When order volume grows, add materialised daily rollups
  refreshed by cron. The function signatures stay the same.
