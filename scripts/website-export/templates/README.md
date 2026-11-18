# RosterHockey Website — independent project

This is a complete standalone public website, not another artifact in the Roster
app project. Import this ZIP into a **new Replit project** and name it
`RosterHockey Website`. It will then appear separately in your project list.
Preparing/importing this project does not publish it or change live domains.

## Run independently

Requires Node 20 or later.

```sh
npm ci
npm run dev
# production/static build:
npm run build
npm start
```

Development and production serving use port 5000 by default. Production serving
also respects the hosting provider's `PORT`. Do not copy any secrets from Roster.
No database, auth provider, Stripe, RevenueCat, OneSignal, storage or email account
is required. All assets, source, styles, dependencies and public price content are
local. Do not replace them with references to the app repository.

## Analytics

The approved provider is **Vercel Web Analytics**, not the app's visitor/location
collector. Analytics is off during local/isolated verification. For an approved
Vercel deployment, enable Web Analytics there and set the public build variable
`VITE_ENABLE_ANALYTICS=true`, then rebuild. Do not enable it on a host that does
not serve Vercel's insights script/endpoints. WEBSITE visits will not populate the
app's existing visitor dashboard. No user IP lookup or APP API tracking is copied.

## Boundaries

- APP links use https://www.roster-app.com and safe new tabs. Referral/partner
  codes and recognized campaign parameters are forwarded; only APP validates and
  saves credit. Existing app-store links remain app-store links.
- The partner marketing page opens the same styled APP-owned application at
  `/referral-program/apply`. Processing, uploads, validation, email confirmation,
  partner portal/admin and referral records stay in APP.
- `/get-started` still belongs to the existing APP onboarding flow.
- `/contact` uses existing support content. There is no blog or fabricated blog
  content; `/blog` returns a real 404.
- `/terms` aliases existing Terms of Service. Privacy and terms are independent
  local website copies; the app retains its own copies.
- Soccer/baseball retain the existing redirect to `/hockey`; they remain
  unlaunched, noindex, and excluded from the sitemap. No new sport page is added.
- `/hpib` deliberately redirects to the existing APP-owned campaign page.
  HPIB view/store-tap tracking and its historical data remain untouched in APP.
- Ordinary URL parameters do not survive an app-store install. Manual partner
  selection remains the fallback. Paid deferred deep linking is not included.

## Hosting and release

`npm run build` emits route-specific initial HTML and metadata, sitemap,
robots.txt, llms.txt and a real 404 page into `dist/`. Static hosting must serve
these directory index files without replacing unknown paths with home HTML.
`vercel.json` and the small Node server include the agreed route/header rules.

For a separate Replit project, use `npm run dev` for preview and `npm start` after
building for production. The supplied `.replit` describes only this website.
Vercel can use `npm run build`, output `dist`, with the included rules.

Before publishing, obtain separate approval for each project's hosting/domain
settings and DNS cutover. Retain apex-to-www normalization.

**APP release prerequisite:** the attribution changes and new public partner
application currently exist in APP source/preview, not an automatically published
release. Publish the approved APP frontend/backend changes **before** publishing
the WEBSITE or pointing its domain at this export. Until then the exported
production Apply link may not exist on the live APP. Review the form in the APP
preview; do not test it by submitting real applications.

On real iPhone and Android devices, check:

- WEBSITE `/`, `/features`, `/pricing`, `/referral-program`, `/contact`, `/terms`.
- A real approved `?ref=...&utm_source=...` link → Login/Get Started → verification
  → partner confirmation → canonical APP referral record.
- APP `/referral-program/apply` → validation/upload/email verification and portal.
- APP `/get-started`, login/reset, shared game/team/payment links, store buttons.
- HPIB `/hpib` page view and both store taps; no duplicate tracking.
- Cold/warm native opens and an install without referral parameters, using manual
  selection. No automatic post-install attribution is implied.

See the separate handoff review for verification evidence and proposed app-side
cleanup. Nothing should be deleted from APP until that review is approved.
