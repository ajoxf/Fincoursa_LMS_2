# Migration from Thinkific

## 1. Export (read-only in Thinkific)
- Users / students CSV, enrollments + progress CSV, orders CSV, coupons, affiliates, course structure.
- Download every lesson video and file, or use originals from your own storage.
- Note every live URL (courses, bundles, landing pages) for redirects.

## 2. Import mapping

| Thinkific | New platform |
|---|---|
| Course / chapter / lesson | `courses` (`legacy_thinkific_id`), `chapters`, `lessons`, `lesson_bodies` |
| Bundle | `bundles` + `bundle_courses` (`legacy_thinkific_id`) |
| Price | `prices` (amount in minor units) |
| User | Supabase Auth user (invited, no password) + `profiles` |
| Enrollment | `enrollments` with `source = 'migration'`, `enrolled_at`, `expires_at` |
| Progress | `lesson_progress.completed_at` per completed lesson, then `recompute_enrollment` |
| Order | `orders`/`order_items` as `paid` historical rows (no fulfilment re-run) |
| Affiliate | `affiliates` (same codes, so existing links keep working) |
| Video | upload to Mux (`/api/video/uploads` or Mux API with `passthrough = video_assets.id`) |

**Passwords cannot be exported from Thinkific.** Migrated students sign in with the email magic link
(leave the password empty on the sign-in page) and can set a password in Settings.

## 3. URLs
The new site keeps Thinkific's paths (`/courses/:slug`, `/bundles/:slug`, `/pages/...`, `/users/sign_in`).
Use the same course slugs where possible. Extra redirects go in `next.config.ts`.

## 4. Cut-over
1. Full import to staging, then verify counts (users, enrollments, revenue totals) against Thinkific reports.
2. Freeze new Thinkific sales, run the delta import of the last orders and enrollments.
3. Switch DNS for fincoursa.com to Vercel.
4. Email students: "Your courses have moved, sign in with a link sent to your email."
5. Keep Thinkific read-only for 30–60 days as a fallback, then close it.
