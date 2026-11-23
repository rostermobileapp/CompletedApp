# Guarded High School onboarding — DEV phase

## Revised export

The 25-screen revision is documented in
[`high-school-youth-onboarding-dev.md`](high-school-youth-onboarding-dev.md).
The current review route is `/high-school/onboarding-preview`.
The former combined preview and unused older wizard were removed on
November 23, 2026. Their frontend components, exclusive walkthrough tests and
legacy preview route are no longer available. The shared guarded backend
services documented here remain in use by the revised flow.

## Scope and current boundary

This is the owner-approved **guarded DEV onboarding phase**, not completion of
Section 2 or permission to enable real registrations. There are no production
migrations, deployment changes, email/push sends or purchase calls in this phase.

The authenticated implementation accepts HS mutations only for confirmed
`@example.com` synthetic Auth accounts carrying the **server-owned**
`app_metadata.synthetic_high_school_onboarding_dev` marker. User metadata and
client role claims do not establish school authority. Ordinary adult selection
does not grant a school role.

Fast current-preview verification, with no database or provider credentials:

```sh
npx tsx scripts/verify-high-school-youth-preview.ts
```

This verifies the revised memory-only preview. The retired combined preview's
browser harness was removed with its components; it is not current UI coverage.

### App-router integration checks

```sh
npx tsx scripts/verify-high-school-onboarding-router.ts
```

This separately bundles the actual exported `App.Router`, React Query client,
request/header plumbing, parent-session store, onboarding and verification
screens. Twelve browser groups cover guest entry, preview isolation even for a
signed-in parent, both adult-path handoffs, returning adult access, locked-parent
and pending-staff routing, unavailable services, distinct password-approval
purpose, and removal of player fields/cached intake on lock, expiry, reload,
same-account session replacement and sign-out. A cached completed-adult response
must not bypass an active HS onboarding or parent gate.

Auth events and HTTP responses are **synthetic loopback fixtures**; unrelated
pages/layouts are markers. Adult handoff checks verify the route boundary, not
the internals of the existing adult setup screens. The script opens no database
connection and contacts no provider. Its code-request buttons call a local
fixture only; no email is sent and no password is changed. This does **not**
complete real-provider SDK, full App-provider-stack, real-inbox or native-device
acceptance. No application behavior changed in this testing revision.

The authenticated workflow is `/high-school/onboarding`. Its state is also
checked before new DEV accounts enter existing adult onboarding. Returning
completed adults keep their unrelated adult features when requesting staff
access, including legacy profiles resolved by confirmed Auth email rather than
the Auth ID. Adding a family context to an existing completed adult is blocked until
profile/context separation exists.

## Implemented

- Four entry paths; existing adult profile and organizer options remain.
- DEV-only 18+ attestation before both existing signup SDK calls and before path
  selection. Under-18 answers stop signup and show a parent setup share link.
  An attestation is not proof of age.
- Head Coach, Assistant Coach, Athletic Director and Team Manager intake;
  school/co-op search and team selection; recipient-bound staged invitations
  skip search. Only HC/AD can request a new school, never self-approve it.
- Initial school authority requires a trusted league approver. Approved ADs
  govern their school; approved Head Coaches can review assistant/manager
  requests for their own team. No self-approval or repeated decision.
- Parent choice enrolls **only marked synthetic fixtures** into the existing
  parent-email guard. Shared credentials remain. New sessions/devices do not
  gain parent authority from the password, path choice or device alone.
- Minimal player intake, server-enforced four-player household limit,
  per-player versioned consent with server-recorded timestamps, optional
  photo/public-name consent off by default. No child contact fields or DOB.
- Recipient, team, creator authority and expiry checks on invitations and
  staged imports; imported identity is server-owned. Unique staged claims stop
  duplicate household claims. These are staging/intake records, not active child
  profiles.
- Resumable server drafts, optimistic revision checks, staff approval requests
  and safe pending screens. Parent fields disappear when authority expires or
  is cleared; verified return reloads the saved intake.
- New DEV accounts cannot skip entry/18+ attestation by calling legacy APIs.
  Pending new HS-only accounts cannot use legacy adult authenticated APIs or
  sockets. Existing completed adult staff applicants retain unrelated adult
  access. Family sockets remain blocked by the prior guard.
- Private schema, RLS without client policies, no access for public/Auth API
  roles, no-store responses and omission of HS response bodies from API logs.
  Parent mutations lock the grant within the same transaction instead of
  acquiring another pool connection while holding the draft lock.

## Deliberately pending — not completed or activated

- No active child profiles, guardian-link model, school roster membership,
  protected Team/Family chats, scoped child APIs or child-device experience.
- Player self-entry is recorded as `waiting_staff_review`. Reading/reviewing
  those details by staff remains blocked until protected roster access exists.
  The current Approvals list handles **staff requests**, not child rosters.
- New-school approval without a team stops at `team_setup_pending`; approval
  with a provisioned test team stops at `coverage_pending`. No default chats
  are created. Imported claims also stop at coverage pending.
- No seat allocation, household Pro activation, sponsor selection/replacement,
  purchases, real invitation creation/delivery, notification delivery or real
  family enrollment. A pending request is not an active join.
- The draft consent copy is not legal approval for real-family activation.
  Real import pipelines, retention/deletion jobs, withdrawal and multi-context
  household/role management still require their own implementation.
- Expired invitations/staging cannot be claimed. This is not a claim that a
  production retention/deletion service exists.
- Full App-provider-stack/real SDK acceptance, physical iOS/Android acceptance and the
  previously deferred real-inbox parent/password acceptance are still pending.

## Installation and validation

Never run database push or put this SQL in production migrations. The explicit
installer validates separate DEV database/Auth references before connecting.
Default invocation is read-only; `--apply` installs only the private DEV schema:

```sh
npx tsx scripts/install-high-school-onboarding-dev.ts --apply
npx tsx scripts/install-high-school-onboarding-dev.ts
npx tsx scripts/verify-high-school-onboarding-dev.ts
npx tsx scripts/verify-high-school-parent-dev.ts --browser
```

The schema has eleven RLS-enabled tables. Installation enrolled no accounts.
Verification creates only marked synthetic Auth fixtures with confirmed
reserved-domain addresses and captures OTP delivery **inside the private test
process**, never through an HTTP inbox or real email transport. It removes and
verifies deletion of its fixture accounts and dependent data.

The onboarding service verifier remains available without `--browser`; its old
browser harness depended on the retired combined UI and was removed. Passing
that switch now fails before connecting to DEV services, with directions to the
current preview and router checks above. The independent parent-security
browser verifier remains available. These checks are not native-device acceptance.

Current verification results are in `high-school-onboarding-dev-results.json`.
The repository already has TypeScript diagnostics; compare against HEAD rather
than calling the whole-project typecheck clean. Dedicated changed-service
strict checking and the production bundle build must also pass.

Use only **Start application** / `env -u PREVIEW_USE_LIVE_SECRETS npm run dev`
when refreshing the DEV workflow. Do not use the root live-preview command,
enable email delivery, publish or deploy as part of this change.
