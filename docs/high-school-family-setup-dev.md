# Existing adult family setup — isolated DEV

## Scope and review boundary

Existing adult players can open **Profile → Family → Add a child** without
repeating signup or replacing their adult account. This is an additive,
resumable journey, separate from original adult/player/organizer/staff intake.
It is available only in isolated DEV to server-identified, confirmed,
owned synthetic accounts. It is not a production release.

The explicit installer is `scripts/install-high-school-family-dev.ts`, backed
by `scripts/dev-only/high-school-family-setup.sql`. It requires a separate
DEV Auth/database target. It is not called by application startup or merge
setup. No production Drizzle migration or production data change was made.

## Behavior

- Starting setup enrolls parent protection, not children or team authority.
  The introduction explains that parent email verification also protects
  adult access on this shared-credential account.
- Parent verification is required before reading or changing saved child
  data. Proof is temporary, in-memory and bound to the verified Auth session.
  The actual provider password-update guard remains in force.
- A parent can save incomplete drafts, resume after verification, discard
  unsubmitted drafts, review the existing privacy declaration for each child,
  and request a team by code or valid staged-player invitation.
- A matched invitation draft can be discarded even if the invitation expired
  or its creator lost authority. Discard requires current parent proof and
  revision checks, preserves the team's staged record and existing requests,
  and does not permit editing staged identity. A submitted invitation does
  not lock the next child's setup.
- The household limit is two unique children across drafts and requests.
  Names, graduation year, position, optional jersey number and existing
  consent choices are reused. No child email, phone, birthday or Auth account
  is created.
- Draft, pending, declined and approved states are distinct. Coverage is
  displayed separately from team approval and device eligibility.
- Authorized head coaches and ADs can approve or decline requests through
  the team roster. Assistants and managers cannot approve them. Review
  rechecks scope, ownership, consent and household size and writes source
  decisions and canonical memberships atomically.
- Approval creates a **disabled** child profile and canonical parent/player
  relationships, preserving any other staff role. It never enables login
  or devices.
- Approved parent teams use the established team switcher; Family remains
  reachable before approval. Returning to the adult account selects an
  approved adult team.

Adult identity, account role, memberships, original onboarding, history and
subscription ownership are not converted into a global parent role. The
family flow retains the existing public-user mapping when the public profile
ID differs from the Auth ID. Coverage uses the existing personal/league
coverage service and creates no purchase, seat or subscription entitlement.

## Authority and transition safety

Ordinary adult HTTP reads/writes and adult sockets require proven,
session-bound parent/adult authority once family protection is enrolled.
Knowing the shared password is insufficient. Child sessions are not promoted
by an adult-mode flag.

Socket authentication, incoming actions and outgoing payloads recheck
authority; idle connections are rechecked too. Account/team/family transitions
cancel scoped work, close old sockets and clear sensitive query caches.

An actual browser check exposed a route/selection observer handoff: the URL
could become a school URL before the saved adult selection updated. The
boundary now forbids adult-provider mounts on school URLs and offers approved
team recovery rather than briefly starting trivia or badge requests. The
regression harness tests this on phone and desktop.

Parent-authority loss clears displayed child information and returns to
verification; it never opens the adult account as a fallback. Family endpoint
response bodies are excluded from server response logging.

## Verification on 2026-11-24

### Actual hosted DEV Auth, SQL, HTTP and signed-in browser

Run `npx tsx scripts/verify-high-school-family-dev.ts` against the running
isolated application. The runner validates the distinct DEV target, creates
owned synthetic adult/staff accounts with actual approved adult membership,
league, team, completed game and existing statistics, then cleans all fixture
records and Auth users.

All ten acceptance groups passed:

1. Existing free adult account and playing data predated enrollment.
2. Actual phone Profile entry and parent verification.
3. Draft save/reload/resume with new parent verification.
4. Invitation match, per-child consent and pending request, with a second-child
   entry available and no child yet created.
5. Verified adult reads/writes and socket authentication; fresh-session proof
   reuse and direct provider password mutation denied.
6. Actual signed-in head-coach roster approval, persisted through reload,
   with canonical relationships and child access still disabled.
7. Actual adult/parent/Family switching, unchanged adult data, and no excluded
   adult-feature requests while in the school/family surfaces.
8. Desktop resume and horizontal-layout check.
9. Submitted one-child invitation followed by second-child setup; a matched
   invitation whose creator was revoked could be discarded, preserving the
   staged source and first request, then replaced by an ordinary team-code
   request. The two-child limit still applied.
10. Expired proof cleared child names and continued denying adult APIs.

Email verification used the **actual route factory, actual DEV provider
tokens, actual verification service and actual database-backed grants**.
Only challenge delivery was redirected to a private loopback Express server
with an injected in-process captured mail transport. The UI verified codes
against the running application. There is no public code reader and no
persistent email configuration change.

The runner reported no browser exceptions and successful database/Auth
cleanup. Reports and signed-in screenshots are retained under
`generated-artifacts/high-school-family/`, excluded from Git/deployment.

### Supplemental regressions

- **10 new SQL/socket tests** passed, including wrong/missing authority,
  duplicate/conflicting submissions, household limits, canonical reviewer
  permissions, invitation identity and creator revocation, legacy profile
  IDs, expired-invitation discard with authority/conflict checks, second-child
  recovery, original onboarding preservation, and stopped outbound socket data
  after authority loss.
- **88 targeted service, SQL, authority, staff, youth, skin and coverage
  checks** passed across the combined run and separately configured skin
  migration test. The migration test requires its disposable loopback
  `TEST_DATABASE_URL` (`127.0.0.1:56439/hs_skin_test`); it is not a hosted DB.
- The browser skin lifecycle matrix passed, including the new stale-adult
  school-route recovery on phone and desktop, no old polls/sockets/caches,
  revoked-team recovery and copied-account selection recovery. Its context
  responses are fixtures, not evidence of provider authentication.
- Full TypeScript remains at **224 pre-existing diagnostics**, with no new
  errors in the changed family/socket/boundary modules.
- The separately exercised existing `proCoverageUi.test.ts` still expects
  “Personal Player Pro could not be verified” where the unchanged page says
  “Player Pro coverage could not be verified.” Both strings were checked
  against the pre-change source. This is not a clean repository-wide test
  or type-check claim.
- Some concurrent initial adult Profile requests logged imported-identity
  reconciliation deadlocks in the existing user-sync path. The acceptance
  flow still completed. User-sync lock ordering was not changed in this
  family phase; investigate it as a separate, performance-sensitive change.

## Not enabled or claimed

No real families, child devices, native/two-device acceptance, real inbox,
email/push/invitation delivery, billing/provider transactions, purchases,
fundraisers, broader parent/player dashboards, production migration or
publication. The hosted adult fixture was free; paid coverage remains covered
by the existing scoped coverage tests, not a live-store purchase exercise.

Declined requests are displayed but this phase does not add resubmission or
post-review identity editing. Approval is not permission to start the next
parent/player or device-activation phase. Stop for the owner's DEV review.
