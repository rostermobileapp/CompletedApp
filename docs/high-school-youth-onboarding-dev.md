# Revised High School / Youth onboarding — isolated DEV

## Review entry points

- `/high-school/onboarding-preview`: interactive, memory-only screen review.
- `/high-school/onboarding`: authenticated, guarded DEV onboarding.
- `/login?signup=1`: existing real signup form, without the old age question.
- `/under-18`: parent-share/code-entry choices.
- `/under-18/code`: child-device entry. Code-only activation is deliberately blocked.
- `/high-school/legacy-onboarding-preview`: historical walkthrough, not the revised flow.

The preview is a simulation, not a successful registration, identity check,
parent approval, coverage allocation or security acceptance. Its school and
family examples are not inserted into the database. Do not enter real family
information. Reloading resets the simulation.

## What this phase provides

- DEV hockey type at questionnaire step 3/10 and the five adult roles at 4/10.
  The current adult profile-before-questionnaire order, adult billing and
  returning-account access remain in place.
- Separate staff, parent and HS league-admin branches, each retaining a
  validated referral and a non-player adult profile.
- Staff role, eligible school search, team selection, and pending approval.
  Head coaches/ADs can request a school; requests never approve themselves.
- Up to four player drafts, individual versioned consent, invitation/team-code
  entry or join-later, and honest pending family coverage/completion screens.
  Parent-device controls can be explicitly locked.
- Private league drafts: details, schools/teams, validated CSV schedules,
  staged invitations, unspecified `[Price]`, status-only seats and draft home.
  No actual invitations, purchases, active leagues or Commissioner entitlements
  are created.
- Independent child-code/request/session services and a child-only profile,
  own schedule and approved Team/Family chat reader/composer. No child
  capability is accepted as parent authority or sent through the parent
  transport. The application **always constructs this service disabled**.

The new schema is additive and private in the separate DEV database. All
tables have RLS enabled and no schema access for Supabase API roles.
The installer is explicit; it is not a startup, production or post-merge
migration:

```sh
NODE_ENV=development npx tsx scripts/install-high-school-youth-dev.ts
# Initial installation only, after approval:
NODE_ENV=development npx tsx scripts/install-high-school-youth-dev.ts --apply
```

HS writes remain limited to verified synthetic `@example.com` accounts carrying
the existing server-owned fixture marker. Parent private data and actions
additionally require the existing account/session-bound parent verification.
Removing signup's age control is not age verification or permission to enable
real child registration.

## Child-activation blockers

1. **Pairing protocol approval.** An arbitrary wrong six-character code does
   not identify which child's challenge was intended. Per-source throttling
   alone cannot guarantee five failures per challenge. The service counts
   source failures and, when supplied, challenge failures. The UI therefore
   requires a parent-shared challenge identifier; the code itself is never
   placed in the link. This protocol remains subject to owner approval.
2. **Identity and coverage acceptance.** The retained shared-parent-credential
   design needs actual provider/native acceptance, including session changes,
   account changes, password changes and parent-only operations. Existing
   captured guard evidence has not been replaced by new real-family proof.
   Intake/consent does not create approved children or paid coverage.
3. **Product rules.** Non-high-school youth eligibility, consent rules, real
   Family/League products and cross-league household funding must be approved.
   No prices or seat ownership are inferred from local plan selection.

Consequently real setup-code issuance, request approval/redemption and child
session APIs fail closed with child activation unavailable. No real families
were enrolled, no provider settings changed and no messages or charges were
sent while implementing/verifying this phase.

The preview child session is memory-only and requires explicit simulated
parent approval. Real child-session persistence, native return/resume and
multi-device acceptance remain unverified. No child storage or realtime
subscriptions are exposed; child access cannot enter existing adult routes,
sockets or uploads using its opaque child token.

## Verification

```sh
npx tsx --test server/tests/highSchoolYouthOnboarding.test.ts \
  server/tests/highSchoolParentSecurity.test.ts \
  client/src/lib/parentVerificationSession.test.ts
npx tsx scripts/verify-high-school-youth-preview.ts
npx tsx scripts/verify-high-school-onboarding-router.ts
npm run build
```

Results for this phase:

- 41 focused checks passed, including input scope, referrals, staff selection,
  code lifetime/use limits, failed-attempt persistence, denied/waiting/replayed
  requests, disabled activation and separate child transport.
- Eight browser journey checks passed through the actual questionnaire and
  new screen components; parent consent/join-later, all three HS branches,
  staged-player invitation replacement with fresh consent for every imported
  player and token retention through the invitation-backed pending join,
  explicit simulated approval and distinct Team/Family messages were checked.
  The preview lookup resets player/guardian consent and its join validates
  saved consent and invitation binding instead of silently accepting a request.
- Twelve router checks passed using the real App router, query/request and
  parent-session plumbing with synthetic Auth/HTTP boundaries. Returning
  adults, pending staff, expired/reloaded/changed parent sessions and explicit
  locking were checked. No external requests or real messages were made.
- Production build passed. Full-project TypeScript still reports 226 existing
  diagnostics; the new onboarding modules have no TypeScript diagnostics.
- The application workflow was restarted and served normally. The public DEV
  preview was visually checked at 390×844; its primary action measured 52px,
  choice cards met their 104px minimum, and no horizontal overflow was found.
  Anonymous league-draft access returned 401 and child activation returned the
  intended 503 blocked response. The signed-in UI was verified only
  with isolated fixtures, **not with a real provider account**.

Generated browser evidence is under the ignored
`generated-artifacts/high-school-youth-preview/` and
`generated-artifacts/high-school-onboarding-router/` directories.
Browser/mocked-service checks do not prove real database race behavior,
native system sharing, multi-device identity safety or live entitlements.
These are acceptance blockers, not permission to weaken the guards.
