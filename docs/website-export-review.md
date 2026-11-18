# Standalone WEBSITE export checkpoint

## Review boundary

The next copy-only step is complete. A new Replit project has **not** been
automatically created. Download `generated-artifacts/RosterHockey-Website.zip`,
then use **https://replit.com/import → ZIP** to create a new project named
**RosterHockey Website**. That import creates the separate sidebar project.

Do not download/import this whole Roster app project. Use only the website ZIP.
Do not copy app secrets. No app files have been deleted; nothing is published,
and no DNS, hosting, auth-provider or native-wrapper settings have changed.

## Export contents

- Independent React/Vite source, package manifest and dependency lock, Node 20+
  setup, dev/build/start commands, README, `.replit`, and Vercel rules.
- Existing homepage, features, pricing, about, community partners, comparisons,
  line-combo explanation, hockey/segment pages, support/contact, privacy and terms.
- Local public media, independently copied shared presentation/legal content,
  local public pricing, and localized existing Google fonts with OFL licenses.
- Auth-free entry/router and build/prerender. No parent-project imports, shared
  runtime package, app SDK, database, API proxy or app credential configuration.
- Static route-specific initial HTML, canonicals/OG/JSON-LD, existing organization/
  software/offers/FAQ structured data, sitemap, robots.txt, llms.txt, and real 404.
- Approved Vercel Web Analytics, disabled locally and until the separately
  approved hosting configuration enables it. Website hits no longer call the app
  visitor collector; existing APP endpoints/history remain untouched.
- Safe new-tab APP CTAs, including campaign/referral forwarding. `/get-started`
  stays APP-owned. Application/portal/auth/HPIB routes are explicitly delegated
  to APP, rather than using a broad unknown-path fallback.
- `/contact` reuses support content; `/terms` aliases existing terms; `/blog` is a
  real 404. Soccer/baseball preserve their existing `/hockey` redirects and remain
  unlaunched, unindexed and excluded from the sitemap.

## Small APP prerequisite

Added public `/referral-program/apply`, rendering only the existing styled
application. Fields, upload restrictions, multipart format, validation, error/
retry and email-confirmation messaging are retained. The dedicated APP entry
uses its own relative `/api/referral/apply` endpoint. Existing partner marketing
rendering remains available unchanged by default.

The backend, email/upload processing, verification, partner portal/admin and
stored referral records have not been moved or changed. HPIB source/handlers are
unchanged. The existing APP application component and CSS must be retained until
the later approved cleanup extracts its minimal standalone form dependencies.

## Completed verification

- Generated sources copied outside the repository; no symlinks/parent imports.
- Fresh `npm ci`, standalone typecheck **with zero errors**, and production build
  passed with the environment reduced to PATH, HOME and CI: no APP credentials.
- 20 public routes returned prerendered content, website-owned canonicals and
  structured data. Unknown/blog/API/association paths returned actual 404s.
- Explicit APP redirects preserved queries; unlaunched-sport redirects, noindex
  headers and sitemap exclusions passed.
- 10 public pages checked at 1440px and 402px: no horizontal overflow, missing
  local assets, JavaScript page errors, or APP/API/location-tracker requests.
- All inspected APP entry links use the canonical APP origin, safe new tabs,
  and the forwarded first referral/UTM context. Annual pricing toggles passed.
- The original bracket's rendered SVG connectors completed using the original
  timing and geometry. Only copied TypeScript SVG target assertions changed.
- Actual APP public form was tested with both submissions intercepted: invalid
  file rejection, same-origin multipart field names, server error/retry, and
  confirmation passed. No live applications or emails were created by the test.
- Public APP form and isolated WEBSITE screenshots captured for review.

This does not claim production publishing, actual email delivery, installed iOS/
Android behavior, or verification of a newly imported Replit project. Those remain
separate release/import checks documented in the export README.

## Proposed cleanup

See `generated-artifacts/website-review/proposed-app-cleanup.csv` and `.md`.
These are conditional review candidates, **not an executed removal list**.
Uploaded/historical/dynamically referenced media are excluded from automatic
removal. The earlier literal-only asset inventory was not sufficient to find
template-generated media paths; the export now includes those closed public
marketing namespaces and verified their real browser requests.

Only after the new project is imported, verified, and reviewed should APP-only
routing/build/indexing work and individually approved deletions proceed.

Before WEBSITE publishing/cutover, separately approve and publish the APP's
attribution frontend/backend and public application route. They currently exist
in source/preview only; the exported production Apply CTA must not be shipped
before its live APP destination exists.
