# Design handoff: matching fincoursa.com exactly

**What already matches the live site:** page list and URLs, navigation (Learn ▾ Bundles / free Course /
Paid Courses, Instructors, For Organizations, Contact, Login, Sign In), the order of every home-page
section, and all copy: hero, Industry Experts strip, Built for Growth, Learning Paths, Featured Courses
with the category filter, The Faculty, For Organizations tabs, FAQ, and footer. Logos and faculty photos
are the same images, currently loaded from Thinkific's CDN.

**What is a placeholder:** colours, fonts, font sizes, radii and spacing, because the live CSS could not be
read from the build environment.

## How the exact styling goes in

All visual tokens live in **`src/app/theme.css`**. Components only use these tokens, so replacing the
values restyles the whole site without touching page structure:

| Token | Where it shows |
|---|---|
| `--fc-primary` | header/footer, hero, dark sections, headings |
| `--fc-accent` | primary buttons, section labels, progress bars |
| `--fc-surface`, `--fc-surface-dark` | alternating section backgrounds |
| `--fc-text`, `--fc-text-muted`, `--fc-border` | body text, secondary text, card borders |
| `--fc-font-heading`, `--fc-font-body` | typefaces (add a Google Font in `layout.tsx` if the theme uses one) |
| `--fc-radius`, `--fc-radius-button` | card and button shape |

## Capturing values from Thinkific (read-only)

Any one of these works:
1. **Theme code:** Thinkific admin → Design your site → Theme → Edit code. Copy the CSS/settings files.
2. **Saved pages:** Chrome → File → Save Page As → *Webpage, Complete* for the home page, a course page and a
   bundle page.
3. **Live inspection** through Claude in Chrome (read-only). Computed colours and fonts are read from the page.

Then: set the tokens, compare side-by-side screenshots at 1280px and 390px, and adjust spacing where needed.
