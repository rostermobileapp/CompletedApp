# High school staff operations — isolated DEV review

## Scope

The approved coach/AD phase is implemented in the existing RosterHockey team
space. Head Coach, Assistant Coach, Team Manager and Athletic Director use the
existing Home, Schedule, Roster, Chat and More navigation. Parent/player
operational screens and runtime child activation remain unimplemented/disabled.
The unauthenticated skin preview deliberately remains the labelled Phase 1
foundation preview, not an operational API bypass.

Production was not migrated, deployed or published. The explicit isolated DEV
installer was applied successfully. No existing pending accounts were approved.
Owned synthetic staff used for actual Auth/browser checks were deleted afterward.

## Implemented behavior

- Every staff operation checks an actual unexpired Auth session, the verified
  synthetic DEV identity and the current approved **canonical** team role.
  Neither billing roles nor requested onboarding roles grant staff authority.
- Program locks serialize permission checks with approvals/revocations.
  Head coaches manage assistants/managers on their team; ADs manage their
  approved program. Self-approval/revocation and cross-program actions fail.
- Existing league/bootstrap decisions use the same atomic canonical writer.
  A league-approved initial school without a team receives a first
  `<school> Varsity` team in that transaction; its name can subsequently be
  edited. AD-created teams inherit current canonical AD memberships.
- Settings update both source and canonical team names atomically. Invitations
  are persisted as development-only, delivery-disabled records for synthetic
  assistant/manager recipients; there is no outgoing invitation delivery.
- Home uses persisted schedule/rink/address details, an encoded external map
  link, lineup readiness and actual canonical player/guardian/consent state.
- Roster excludes staff-only memberships. CSV creates restricted, expiring
  staging records only, with preview errors and server-side revalidation.
  It does not create Auth accounts, children, consent or approved memberships.
- Schedule create/edit/delete and imports persist. Version conflicts and final
  games are protected. Deletion is soft deletion. Repeating an unchanged
  schedule import does not create another identical event.
- Dress/scratch entries and explicit same-program call-ups are persisted.
  Only canonical child/player memberships with current guardian linkage and
  consent can be saved. Ineligible entries remain visible with explanations.
- Final reports use a database-time gate of two hours after start, preserve
  their final score and reject subsequent edits/reports.
- Schedule changes commit a durable outbox event and immediately invoke an
  injectable DEV-only transport. Failed delivery attempts retain their stable
  idempotency key for authorized retries. The app transport is deliberately
  no-delivery; no production notification provider is called.
- Team, Parents and Coaches Only rooms have real persisted staff read/send
  operations and active-tab-only polling. Membership is rechecked per request.
  There is no staff access to Family rooms or arbitrary recipients/groups.
- The existing Team message store now supports distinct child and adult staff
  authors. Future child protocol tests read/reply in the same Team thread and
  the child's own Family only. Parents/Coaches rooms and another Family are
  denied, even with a forged room-membership row. Runtime activation is still
  constructed with `false`.
- AD tools expose program-scoped roster gaps, pending staff decisions, Team
  message reports and audit events. They cannot inspect private Family rooms.
- Payment creation reuses current approved-league membership and existing
  premium/commissioner eligibility, and writes ordinary payment requests and
  recipients with a private team link. A staff role never grants premium.
  Team staff can track these requests; only their creator can confirm an
  already-recorded payment, without requiring renewed premium access.
  This phase does not enable card checkout, capture, billing changes or fees
  changes. Fundraisers remain out of scope.
- Query keys include actor/team scope. Transitions preserve the existing
  cancellation/cache clearing and approved-team recovery chooser. Hidden adult
  patches, trivia, achievements, odds, streaks and beer surfaces do not mount.

## Import formats and limits

Imports accept at most 200 rows/events and 200,000 text characters. All row
errors must be fixed before the UI enables commit.

Roster CSV headers:

```csv
firstName,lastName,gradYear,position,jerseyNumber
Casey,Fixture,2028,D,8
```

`position` is `F`, `D` or `G`; jersey numbers are optional, at most two digits.
No consent, email, account-role or activation fields are accepted.

Schedule CSV headers:

```csv
title,opponent,startsAt,rink,address
Varsity game,South,2026-12-02T19:00:00-05:00,North Rink,100 Example Way
```

Timestamps require an explicit offset or UTC. iCal supports individual timed
`VEVENT` entries with `SUMMARY`, UTC `DTSTART` and optional `LOCATION`.
Recurring, all-day, local-time/TZID and malformed entries produce actionable
errors; they are not silently shifted or expanded. Importers never fetch
calendar URLs or attachments.

## Verification performed

1. **46 passing unit/real loopback PostgreSQL/API checks** across the staff,
   existing youth and team-skin suites. Staff checks execute the actual SQL
   installers (including repeat installation) and verify canonical authority,
   stale sources, hierarchy, atomic rollback/bootstrap, revocation concurrency,
   staging, event versions/retries, call-ups, report timing, chat identity and
   privacy, payment ownership, parent verification and production denial.
2. **70 passing actual isolated DEV checks**, using real Supabase-created,
   email-confirmed synthetic staff sessions and the running application's HTTP
   routes. All four staff roles visited all five tabs at 390px and 1365px.
   Included persisted chat/reload, roster preview/staging, pending/wrong-team
   denial, head-coach assistant approval and canonical access after reload,
   approval-panel visibility for every staff role, AD team switching and
   loaded destination data, no horizontal
   overflow, no browser page crashes and no excluded adult-feature requests.
   Fixture cleanup succeeded.
3. **18 passing offline browser/lifecycle scenarios** for all six skins at
   phone/desktop widths, mixed adult/HS transitions, aborted requests, stopped
   polling/sockets, cleared caches, revoked-selection recovery and account
   switching. These are explicitly fixture checks, not provider acceptance.
4. Full project TypeScript check remains at **224 pre-existing errors** with no
   new errors in the changed staff/skin code. `git diff --check` passed.
5. The application workflow restarted cleanly, and the unauthenticated preview
   was visually checked separately. Actual signed-in phone/desktop screenshots
   were captured from the DEV browser tests.

Evidence is in the ignored `generated-artifacts/high-school-staff/` directory.
Scripts:

```sh
npx tsx scripts/install-high-school-staff-dev.ts --apply
node --import tsx --test server/tests/highSchoolStaff.test.ts \
  server/tests/highSchoolStaff.database.test.ts \
  server/tests/highSchoolYouthOnboarding.test.ts server/tests/teamSkin.test.ts
npx tsx scripts/verify-high-school-staff-dev.ts
npx tsx scripts/verify-high-school-team-skins.ts
```

The database test helper requires the explicitly loopback-only disposable
PostgreSQL server on port 56439. It cannot use a workspace or hosted DB URL.
The DEV installer and hosted verification use the existing separate-project,
verified-TLS connection guard and never a live-secret fallback.

## Review limits / stop point

This is not native-device, real-child, real-family, live billing or live
notification-delivery acceptance. Signed-in adult application visuals were
not exhaustively rechecked; its existing mixed-context lifecycle fixture
checks passed. Browser checks exercise real Auth and staff persistence but
cannot establish OS/browser push delivery, native resume or actual store-paid
subscription behavior.

Stop for owner review here. Do not activate parent/player operational screens,
real children, real delivery, card charges, production migration or publishing
as a consequence of completing this phase.
