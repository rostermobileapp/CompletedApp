# Family setup: live rollout status

## Authorized scope

The owner requested live family setup for **every account with a recorded DOB
showing age 21 or older**, independent of plan, role, team membership or completed
adult onboarding. This authorizes preparing the family rollout, not child login,
device activation or unrelated High School features.

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

## Why activation remains blocked

The private tables and provider protection are prerequisites, not optional UI
details. Removing DEV flags would either leave the flow unavailable or weaken
the shared-password boundary.

The DEV Auth guard intentionally rejects provider recovery-token changes,
email/phone changes and identity/MFA mutations after family enrollment. It must
not be copied into production without a safe parent-email recovery path and
compatibility checks for the login providers real accounts use. A captured DEV
mailer is not production inbox verification.

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

1. Prepare a separate, reviewed, explicit production installation; never run
   the DEV installers against live. Document the private tables and additive
   program/child-membership changes. Preserve existing rows, memberships,
   account identity, billing and original onboarding. Obtain the owner's
   authorization for the specific live Auth/schema changes before applying them.
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

**Current status:** DOB eligibility implemented in the guarded DEV flow.
Production family activation is **not enabled** and production data is unchanged.
