# High School / Youth skins: Phase 1 review

## Scope delivered

Only the approved nonproduction foundation and first review milestone are
implemented. Coach/AD operations, family/player operations, fundraisers and
rollout remain separate approval gates.

- Canonical `teams.program_type` and `team_memberships.role` fields, plus a
  program reference and a separate child-profile membership identity.
- `getSkin` consumes those canonical fields and the verified actor type.
  Child actors always receive the player skin; pending/unknown school roles
  do not fall back to adult.
- Role-specific headers, approved-team selection and the requested tab sets.
  Current panels explicitly say operational tools await the next phase.
- A saved team that is revoked or belongs to another account opens an
  approved-team chooser. Recovery requires neither storage editing nor reload,
  and does not implicitly mount the adult runtime.
- An outer mount boundary excludes the adult router, prefetch, shared socket,
  badge/birthday/trivia hosts, native calendar sync and ordinary navigation
  from school skins.
- Surface changes cancel old requests, discard old query state and unmount
  old subscriptions before mounting the destination. Shared-socket cleanup
  invalidates late callbacks so unmount cannot schedule an adult reconnect.
- Adult-only contexts retain the existing application. Mixed accounts use the
  existing adult selector's team eligibility rules, including league-assigned
  teams, rather than a second interpretation of adult membership.

## Nonproduction installation and migration

The explicit installer is `scripts/install-high-school-skins-dev.ts --apply`,
run through `tsx`. Without `--apply`, it only reports installation status and
aggregate migrated counts. Its connection helper verifies the separate DEV
database/API project and verified TLS; it rejects live-preview and production.
There is deliberately no startup, production migration or post-merge installer.

The main Drizzle mappings remain unchanged: adding DEV-only fields there would
make existing production queries select columns that have not been approved or
installed in production. The isolated service reads the actual DEV columns
with parameterized SQL.

Migration inputs are approved programs and approved synthetic requests from
verified fixture Auth users at `example.com`, with the existing current consent
version and two-player household limit. Unapproved/non-fixture records are
excluded. Same-team precedence is AD, head coach, assistant coach, manager,
parent, player. Account billing roles are not changed.

Child memberships reference the separate child registry, not a parent acting
as a player or a newly created child Auth account. Registry activation, consent,
parent grants, device/session checks and runtime activation=false are unchanged.

On the isolated DEV database on November 24, 2026, installation succeeded,
but **zero existing approved fixture memberships qualified**. Thus no source
records were promoted or migrated and no new school teams were materialized.
No new Auth users, approval grants, charges or deliveries were created.

This is an explicit snapshot migration, not a runtime adapter. Subsequent
operational approval/revocation flows must write canonical memberships
atomically in their approved later phase. Reapplying the explicit migration
reconciles only its tracked imported memberships with the eligible source
snapshot; it does not modify unrelated adult memberships.

## Review

Open `/high-school/skins-preview` in the running isolated development Preview.
The banner labels the contexts synthetic. It requires no new account or role
grant, uses memory-only fixture selection, and does not activate a child.
Choose each role, use its navigation and switch between Varsity, JV and adult.
The adult choice is a review marker: it intentionally does not load a real
adult dashboard into an unauthenticated fixture.

That preview is available only behind the existing isolated-development client
guard. It is not an authorization bypass for application APIs.

## Verification

- 43 passing unit/security checks across parent security, youth onboarding and
  the new resolver/mount-boundary tests.
- One passing isolated PostgreSQL/API integration test using real migration
  SQL: approved-only imports, two children, all staff roles, role precedence,
  no account-role changes, disabled child activation, replay/idempotency,
  direct canonical role/status changes, preserved adult-selector authority,
  parent verification, ignored spoofed role/actor inputs and production 404.
- Eighteen passing new browser scenarios: six roles at 390px and 1440px plus
  mixed parent/manager/adult transitions, revoked selected-team recovery and
  cross-account saved-team recovery at each width. These exercise actual
  React Query, persisted team selection, request cancellation and the real
  shared WebSocket provider against a loopback fixture server. All school
  cases have zero adult surface mounts, shared socket attempts or prohibited
  feature requests. The old request aborts, polling stops, query state clears,
  the socket closes without reconnecting, and adult mode can remount.
- Fourteen existing App.Router/parent-session browser checks and nine existing
  onboarding-preview browser checks passed. Their offline fixtures were updated
  to fail closed for the newer signup helper and provide the query context used
  by shared family components; no production signup behavior was changed.
- The running application was restarted successfully and its actual synthetic
  review route was captured at phone and desktop sizes.
- Full `npm run check` still reports the same **224 pre-existing TypeScript
  errors** as the pre-implementation baseline, with no new skin-module errors.
  This is not a clean repository-wide type-check result.

Generated reports/screenshots are under
`generated-artifacts/high-school-team-skins/` and the existing onboarding
verification output directories, all excluded from Git/deployment.

## Not verified or authorized

The browser harness substitutes Auth/context responses; the API integration
test substitutes the verified actor adapter. These do not establish real
provider-SDK login, native resume, live store/provider behavior or real child
activation. The full signed-in adult UI was not visually verified; its existing
route tree remains in place and fixture lifecycle/regression checks passed.
The actual Preview has existing Vite-HMR/CSP console warnings; it rendered the
new review route successfully.

There were no production database changes or publication. No operational HS
screen, actual notification delivery, payment/fundraiser flow or real-family
enrollment is claimed. Stop here for the owner's Phase 1 review.
