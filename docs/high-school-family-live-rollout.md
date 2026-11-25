# Family setup: live rollout status

## Authorized scope

The owner requested live family setup for **every account with a recorded DOB
showing age 21 or older**, independent of plan, role, team membership or completed
adult onboarding. The owner subsequently authorized the protected production
storage, canonical membership and Auth rollout. The initial authorization did
not include child login or device activation; the later restricted-test
authorization at the end of this document supersedes that exclusion only for
the selected production test accounts.

The age rule reads the existing public account's DOB through its verified Auth
identity or existing verified-email mapping. Missing, malformed, impossible and
future DOBs fail closed. One application calendar, `America/New_York`, determines
the birthday boundary; February 29 reaches the threshold on March 1 in non-leap
years. This is recorded-DOB eligibility, not independent identity/age verification.

The existing DEV flow now checks this rule on family state, enrollment, drafts,
consent, invitation lookup, team requests and starting another draft. Reused
family intake cannot skip the trusted eligibility check. Staff review retains
its separate canonical-role checks. The Profile entry reflects the same rule.

## Read-only production findings — November 24, 2026

The native PostgreSQL probe matched the live Supabase project and used verified
TLS, a read-only transaction and an eight-second statement timeout. It performed
catalog reads only; no production users, settings or schemas were changed.

- Parent-security, onboarding, staff and family schemas/version markers were
  absent.
- The stored account DOB column exists and is optional.
- Canonical school-program fields and child-membership fields were absent;
  `team_memberships.user_id` is still mandatory.
- There were no noninternal triggers on the inspected Auth user, identity and
  MFA tables.
- All 148 public tables had RLS enabled, while 137 had authenticated SELECT
  grants. Storage also has authenticated access grants. These counts do not
  establish which rows can be read; the policies need a family-boundary review.
- Railway reported a successful production backend deployment from the existing
  repository/branch and existing Resend/Supabase configuration names. No family
  rollout configuration was present. No release was triggered.

## Why the database foundation alone does not enable Family

The private tables and provider protection are prerequisites, not optional UI
details. Removing DEV flags would either leave the flow unavailable or weaken
the shared-password boundary.

The original DEV Auth guard intentionally rejects provider recovery-token changes,
email/phone changes and identity/MFA mutations after family enrollment. It must
not be copied into production without a safe parent-email recovery path and
compatibility checks for the login providers real accounts use. A captured DEV
mailer is not production inbox verification. The separate production package
now permits legitimate recovery while retaining independent email approval for
password changes. The original DEV guard was not installed on production.

## Installed protected foundation — November 24, 2026

The explicitly authorized, transactional installation **completed on external
production Supabase**. Readiness checks passed before commit, and an actual
read-only PostgREST request observed the installed API guard after commit.

- Added private parent-security and family storage, plus additive program and
  canonical parent/child membership fields. No production school, team, child,
  family, account or fixture was seeded.
- No existing account was enrolled. Child login and device activation remain
  disabled, including a database constraint against enabling a child.
- Existing ordinary adult accounts are outside family protection. Parent
  protection begins only after a successfully delivered parent-action code is
  verified; failed mail cannot activate it or lock ordinary adult access.
- Protected accounts use the backend, not direct Supabase table, RPC, Storage
  or realtime reads. Restrictive public-table policies and a PostgREST pre-request
  guard enforce that boundary. Private tables and write capabilities have no
  browser/provider-role grants.
- Existing-identity profile refresh and ordinary recovery-session issuance are
  allowed; changes to login identity, identity linking, MFA setup and unapproved
  password writes remain blocked. Administrator deletion can still cascade.
- Turning off new enrollment never disables protection for existing families.
- The installer checks the target, verified TLS, required Auth columns, existing
  API hook, public-table RLS, triggers and installed manifest. It refuses an
  incompatible existing installation rather than replacing it.

This was a database installation, **not a Railway/Vercel app release**. The
application changes have not been published, and new live enrollment remains
off until the matching backend is released with `FAMILY_SETUP_ENABLED=1`.

## Current application implementation and verification

The application changes now include a production-only family boundary, Profile
entry (including a shortcut before adult onboarding is complete), parent verification/recovery, private proof headers and cache clearing,
canonical-review team discovery and the existing approval panel. School dashboard,
chat, child-device and broader DEV onboarding routes are not promoted. Returning
to adult mode checks actual approved adult teams rather than trusting selection
storage.

- Latest focused run: **45 checks passed**, including actual disposable
  PostgreSQL, failed-install rollback, unchanged original account/team/membership
  fields, failed-mail enrollment safety, real-account service composition,
  role-scoped review, direct-data denial, disabled children and recovery permits.
- Hosted DEV provider proof used an owned temporary account with the exact
  production guard definitions in a temporary private namespace. Actual sign-in,
  denied unapproved password change, actual recovery-session redemption, approved
  password change, session revocation and administrator deletion passed. Its
  temporary account, namespace and triggers were removed. Mail was captured.
- The hosted DEV acceptance runner again passed all **ten groups**, using
  actual isolated Auth, SQL, HTTP and signed-in 390px/desktop browser contexts.
  Owned synthetic fixture cleanup succeeded; no real email was sent.
- The actual production boundary passed ordinary access, proof gating, child-data
  clearing, incomplete-profile entry without profile mutations, school-selection
  isolation, adult return, review and recovery routing
  checks at **390px and 1440px**. These checks used isolated Auth/API adapters,
  not a production sign-in or a physical-phone test.
- The production frontend and backend bundles built successfully into ignored
  verification output; neither was published or served as the main preview.
  The final full TypeScript check retained **224 pre-existing diagnostics**,
  with none introduced by this work. The application workflow restarted cleanly.

Actual live inbox receipt, a complete Google/Apple provider handshake, and
signed-in acceptance of the published Railway/Vercel release have **not** been
verified. Simulated delivery and identity-refresh SQL are not those checks.

## DOB change verification

- 64 focused eligibility, actual disposable-SQL family, parent-security, youth
  and staff checks passed. They include denial at each own-family service/intake
  path after DOB removal or change, birthday/leap-day boundaries, legacy user
  mapping, consent, reviewer authority, household limits and socket authority.
- The existing hosted DEV acceptance runner passed all ten groups using actual
  DEV Auth, database, API and signed-in phone/desktop browser contexts. Adult
  identity/history preservation, Family entry, draft resume, invitation and
  team-code paths, canonical approval, disabled child access, switching and
  expired-proof clearing passed. Owned synthetic fixture cleanup completed.
- Verification-email transport was privately captured; no real email was sent.
  No real family or production records were created.
- Application restart and preview rendering succeeded. Full TypeScript still
  reports the 224 pre-existing diagnostics, with no new diagnostics from this
  change. This is not a clean repository-wide type-check claim.

## Required production implementation and acceptance

1. Completed: prepare and apply a separate, explicit production installation; never run
   the DEV installers against live. Document the private tables and additive
   program/child-membership changes. Preserve existing rows, memberships,
   account identity, billing and original onboarding. The owner's authorization
   for the specific live Auth/schema changes was obtained before applying them.
2. Promote only the approved family surface and its required canonical review
   path, not all DEV High School onboarding, staff dashboards or preview tools.
   Establish real authorized school/team sources separately; do not seed fake
   production teams or enroll existing accounts automatically.
3. Provide parent-code delivery using the existing live mail provider, plus
   protected recovery and password/account-change behavior. Maintain expiry,
   account-wide rate limits, session binding and private code/proof handling.
4. Prove that direct Auth, database, storage and socket access cannot bypass
   family/parent authority. Check legitimate sign-in, recovery and account
   administration for enrolled and non-enrolled adults.
5. Verify the same 21+ rule on every family server path, irrespective of plan
   or role, including birthday/leap-day boundaries and changed/missing DOBs.
   No client-submitted age or DOB is an eligibility override.
6. Verify actual parent inbox delivery, phone/desktop enrollment and resume,
   canonical review, adult/parent switching, denied fresh-session reuse,
   and unchanged adult histories/billing. Keep child profiles disabled.
7. Publish the compatible Vercel frontend and Railway backend through the
   existing release process only after readiness checks and authorized database
   changes. Replit Publish does not migrate the external Supabase database.
   Confirm the actual live release before describing the feature as live.

**Status at that checkpoint:** Protected production database foundation installed and
verified; no accounts enrolled. Matching application release and live acceptance
remain outstanding. Family is **not yet enabled for live users**.

## Restricted production onboarding and child activation — November 24, 2026

The owner authorized private production test storage and explicitly requested
child login and device activation, restricted to U00001, U00002 and U00250.
Existing adult onboarding, account identity, teams and subscriptions must remain
intact. The selected-account test is not a public High School launch.

The separate installer `scripts/install-onboarding-production-tests.ts` applied
the additive manifest to the verified external production Supabase database.
Its final readiness check confirmed:

- Private onboarding, staff-event/chat and pairing/session storage was installed.
- All onboarding tables retained RLS and denied browser-role direct SELECT.
- Existing Family Auth guards and restrictive public-table policies remained intact.
- The blanket disabled-child constraint was replaced by a protected,
  selected-parent-only constraint. No existing child profile was enabled.
- No account was reset, no staff role was granted, and no fixture was seeded.

The matching application implementation:

- Exposes the production-test entry only after server verification of the
  canonical selected account and current Auth session.
- Uses additive Family setup for completed adults, rather than resetting their
  primary onboarding or bypassing recorded-DOB eligibility.
- Requires a separate nonsecret challenge link, six-character setup code,
  approved canonical child/parent membership, current guardian consent,
  payer-scoped coverage and verified-parent approval.
- Commits failed-code budgets; enforces challenge lockout, expiry and one-use
  redemption; issues a separate child-only capability, never a parent Auth JWT.
- Revalidates access on child reads. Parent revocation remains available even
  after coverage or team access ends.
- Limits children to their covered-team schedules and approved Team/Family chats.
  Child mode discards in-memory parent verification and uses tab-scoped storage
  bounded by server expiry. No parent/payment/DM capability is granted.
- Does not enable test purchases, automatic notification delivery or public
  staff enrollment. Canonical league authority still controls staff approval.

Verification included 44 focused child/youth unit checks, six staff/skin
regression checks, production-mode browser approval/denial/expiry at 390px and
1440px, ordinary adult/Family isolation, routing and the production build.
Repository-wide TypeScript still reports unrelated existing diagnostics.
Browser adapters did not contact real providers or send real email.

**Release boundary:** This change installed production storage and prepared
application code; it did not publish a Railway or Vercel release. The updated
backend and frontend must both be released before claiming child login is live.
Signed-in live UI, real-inbox approval and two-physical-device/native acceptance
were not verified by the offline checks.

## Railway release preparation — November 25, 2026

A fresh, read-only Railway inspection supersedes the earlier unconfirmed-release
status for the backend only:

- Project `Roster`, production service `CompletedApp`, follows
  `rostermobileapp/CompletedApp`, branch `10_1_2026`.
- Railway reports successful deployment
  `9fa83e74-370c-4819-985e-58ee115a853e`, from commit
  `c89271d63b069b6d1a173e043fc9195d3aad78a9`. This contains the earlier
  restricted onboarding implementation, not the new individual-device controls.
- The individual-device controls are merged locally at
  `1dc46d79e2dd80e63158f4826ddafb04b3f2b9dd`. A fresh GitHub branch lookup
  still returned `c89271d63b069b6d1a173e043fc9195d3aad78a9`.
- No Railway changes are staged. The existing Railpack configuration, repository,
  branch, region, domains and production variables were left unchanged.
- Required variable names are present, including `NODE_ENV`,
  `FAMILY_SETUP_ENABLED`, database/Supabase configuration and Resend
  configuration. Railway's connection returns names only, so values and
  real-inbox delivery were **not** verified. Before release, confirm
  `NODE_ENV=production` and `FAMILY_SETUP_ENABLED=1` through the owner's
  Railway settings. Neither preview-isolation variable was listed.
- A read-only unauthenticated request to the actual Railway
  `/api/high-school/family/state` endpoint returned HTTP 401
  `INVALID_SESSION`. This proves route presence and that this request was
  denied, not signed-in availability or complete security acceptance.

Release-candidate verification passed 57 focused checks (production pairing,
youth onboarding, parent mail adapter, staff/team-skin regression and the device
controls browser fixture), followed by five real disposable-local-PostgreSQL
device-isolation checks. The latter initially could not connect because its
local test server was stopped; after starting that isolated server, all five
passed and the server was stopped. The production backend esbuild bundle and
Node syntax check passed into ignored verification output. No hosted database
was used by these tests, and no real email was sent.

**Next release action:** After explicit publishing approval, sync the merged
code to the connected GitHub branch and observe Railway's new deployment.
Pushing may deploy automatically; redeploying the existing build alone does
not include the local changes. Release the compatible Vercel frontend as well,
then verify real-inbox approval, two-device pairing and selective revocation.
This preparation performed no push, Railway configuration write, deployment,
account change or database migration. Signed-in/native acceptance remains open.
