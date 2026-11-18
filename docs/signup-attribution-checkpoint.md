# Signup attribution: isolated review checkpoint

The website/app split remains paused. This change does not remove app or website
files, publish anything, change domains, or change the database schema.

## Behavior

- Capture public referral candidates and campaign parameters before APP routing.
- Recognize `ref`, `referral`, `referral_code`, `referralCode`, `partner`,
  `partner_code`, and `partnerCode`. Trim/uppercase codes; validate against the
  existing approved-partner endpoint. Invalid codes do not reserve attribution.
- Retain the first valid pending referral through routing, reloads, signup, and
  confirmation. Preserve the original candidate when validation is temporarily
  unavailable; retry instead of assigning a later code.
- Save informational `acquisition_campaign` and `initial_referral` context in
  existing Supabase user metadata at signup. Revalidate referral metadata before
  preselecting an onboarding partner. These metadata fields grant no credit.
- Bind pending context to the signup account, do not reuse it for another account,
  and clear owned pending context at sign-out. Clear consumed context only after a
  successful authenticated confirmation.
- Display the linked partner for confirmation in the existing questionnaire.
  Keep the manual partner / Other / None options available when no partner is
  already claimed. Existing saved partners are visibly locked.
- Send the confirmation through the existing authenticated onboarding endpoint.
  A user-row transaction lock protects all referral mutations, including code-only,
  Other, and None requests. Repeating the same partner is idempotent.
- An approved, confirmed selection writes the canonical user fields and existing
  referral link together. Existing paid-user claim handling is retained. Failed
  link writes roll back the user change. No new attribution tables are introduced.
- Only a successful server response populates the existing native subscriber
  attributes / purchase fallback values. UTM parameters never determine payouts.

## WEBSITE-to-APP handoff

The pure link builder and small browser link installer work without auth or API
clients. Existing absolute outbound APP entry CTAs receive recognized referral and
campaign parameters, canonical `https://www.roster-app.com` URLs, and
`target="_blank" rel="noopener noreferrer"`.

Entry destinations covered: `/`, `/login`, `/signup`, `/get-started`,
`/referral-program/apply`, and `/referral-program/portal/login`. The future dedicated
partner application route remains part of the paused split; this change does not
move the existing partner form or create a new route.

Public campaign context is retained in WEBSITE tab/session storage across internal
page navigation. Only recognized parameters are forwarded; auth tokens, arbitrary
query strings, and redirect targets are not copied. Multiple referral aliases are
normalized into an ordered candidate list for APP validation.

The later WEBSITE export must copy the pure link builder/installer, not the APP
capture adapter, auth client, or API calls.

## Verification

Completed against disposable local PostgreSQL and isolated browser fixtures:

- 7 focused parsing/preservation/forwarding tests.
- 8 PostgreSQL tests: link-to-signup-to-confirmation persistence; manual fallback;
  existing partner locks; concurrent competing claims; invalid/suspended partners;
  campaign isolation; paid claim idempotency; Other/None; transaction rollback.
  Some checks share one test case.
- Two browser scenarios using the actual Login and OnboardingQuestionnaire
  components with fixture authentication: URL preselection and manual selection.
  Both sent authenticated saves and persisted the approved partner in PostgreSQL.
- Browser assertions cover Login/Get Started/future Apply handoff links, safe new
  tabs, navigation without query parameters, reused links, and unchanged store
  links.
- Browser fixture recorded no page errors and created no live accounts.
- Client production bundling and server bundling passed.
- The overall repository typecheck remains blocked by 227 existing errors
  (the unchanged HEAD baseline also reports 227);
  the checked attribution modules and modified Login/questionnaire entry points
  reported no errors. This is not a clean whole-project typecheck.
- HPIBDownload source is unchanged. No HPIB view or Apple/Google tap tracking
  handlers were edited.

Browser auth is simulated: this does not claim a live Supabase verification-email
round trip or an actual installed iOS/Android run. Those require release/device
checks, not a production-data test.

## Changed source files

APP entry and UI:

- `client/src/main.tsx`
- `client/src/pages/Login.tsx`
- `client/src/pages/OnboardingQuestionnaire.tsx`

Attribution logic:

- `shared/signupAttribution.ts`
- `client/src/lib/appAttributionLinks.ts`
- `client/src/lib/signupAttribution.ts`
- `client/src/lib/signupAttributionBrowser.ts`

Validated credit persistence:

- `server/referralRoutes.ts`
- `server/routes.ts`
- `server/onboardingReferral.ts`

Tests:

- `client/src/lib/signupAttribution.test.ts`
- `server/tests/signupAttribution.integration.test.ts`
- `scripts/test-signup-attribution-browser.ts`

Documentation/memory accompanies this isolated checkpoint. Generated screenshots
and build output remain outside Git in `generated-artifacts/`.

## Release checklist, not permission to release

- Publish APP frontend/backend together when separately approved: code validation
  now returns the approved partner ID as well as its name.
- On a real iPhone and Android phone, open a WEBSITE URL with a real approved
  partner code and UTM parameters, click Login/Get Started, create/verify an account,
  confirm the preselection, and inspect the saved canonical referral record.
- Check an existing attributed account cannot be reassigned by a new link.
- Verify app-store install fallback by selecting the partner manually after install.
  Ordinary URL parameters do **not** survive an App Store/Google Play installation.
- No paid deferred-deep-linking service was added. Consider one only as a separately
  approved future service if automatic post-install attribution becomes necessary.
- Leave HPIB page views and Apple/Google store taps unchanged.
- Do not resume the website/app split, delete source files, or cut over domains
  until this checkpoint has been reviewed.
