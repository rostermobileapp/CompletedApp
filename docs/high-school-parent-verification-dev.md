# High School parent verification — DEV-only implementation

## Current status after explicit implementation approval

The owner approved the custom DEV-only Auth guard. Three persistent guards and
the private `hs_parent_security` schema are now installed in the separate DEV
Supabase project. Application code is prepared for review; it does not change
the original project's files until merge approval.

**The DEV backend and parent screen passed captured-email verification. The
owner also confirmed receipt of one standalone DEV test email. The complete
parent flow with a real inbox is NOT yet verified, and High School activation
is not approved.**
No production resources or provider configuration were changed. No existing
account was enrolled. Both synthetic fixture accounts were deleted and that
deletion was verified; zero enrolled accounts remained after the exercise.

### What the implementation enforces

- A private, operator-controlled family registry anchors the parent's email.
  User metadata, profile headers and client-supplied destinations cannot grant
  parent authority or redirect a code.
- Existing authenticated adult API routes require a parent-action grant for an
  enrolled family, including reads. No child allowlist or active child profiles
  exist yet. Family WebSocket authentication is refused rather than exposing
  the adult stream.
- The owner explicitly chose **four-digit codes**, with a **two-minute expiry**
  and **three failed guesses per account in a rolling 15-minute window**.
  Failures persist across sessions, resends and both verification purposes.
  The account row serializes concurrent guesses; locked accounts cannot request
  another email, and even a correct code cannot bypass the lock. Success does
  not erase earlier failures. Delivery is additionally limited to
  one attempt per minute and five per hour per account across sessions/purposes;
  aggregate verification is capped at 25 attempts per ten minutes. Failed
  deliveries consume their challenge and return 503, never a fake “sent”.
- A parent-action grant is account/session-bound for ten minutes. A separate
  password-change grant lasts two minutes and is single-use. Tokens are stored
  only as hashes. Parent endpoint response bodies are excluded from logging.
- The Auth-user trigger allows a password change only with a transaction-bound,
  exact-hash write approval, consumed during the write. The password service
  consumes the email-code grant, writes the password and revokes all old grants,
  sessions and refresh tokens in one transaction.
- The custom DEV password policy requires at least twelve characters, all four
  character classes, and at most 72 UTF-8 bytes; bcrypt cost is 12. It rejects
  silent bcrypt truncation and an unchanged password.
- Email/phone replacement, provider recovery, identity linking and MFA
  enrollment stay closed for enrolled families until safe workflows exist.
  Direct unauthorized Auth password changes return a provider error; approved
  password changes must use the new server endpoint.
- Activation is restricted to isolated DEV. Production and live-project preview
  never instantiate this integration. Unenrolled adult accounts retain their
  previous authorization and password-change behavior.

### Verification

`npx tsx scripts/verify-high-school-parent-dev.ts` exercises the installed guard,
the application service, the HTTP route factory and the exact authorization
function called by `isAuthenticated`. Its email sink is process-private and
synthetic-only; it is NOT a public “read code” endpoint.

Verified direct Auth password denial and unchanged original password; normal
adult password change; wrong-session/profile denial; delivery failure; recipient
binding; throttling; expiry; durable failed-attempt counts; code/purpose/replay
limits; direct MFA enrollment denial; protected email/phone/recovery/identity
writes; one successful concurrent password change; invalidated old sessions
and refresh tokens; explicit parent lock; and logout invalidation.

The actual application was also started under isolated DEV with the installed
schema, and its registered verification status endpoint returned 401 without a
session. Production startup was not entered.

44 unit/isolation tests passed. Focused strict TypeScript, server bundling and
the full frontend/backend build passed. Full-project TypeScript remains at **226 existing diagnostics**, with
zero added or removed diagnostics compared with the source baseline.

Current machine-readable local operational evidence:
`generated-artifacts/high-school-auth-proof/implemented-dev-result.json`.
The tracked summary is `docs/high-school-parent-verification-results.json`.

### Delivery and activation remain deliberately gated

The production mailer is NOT reused. A separate DEV adapter is implemented,
but runtime delivery defaults to an explicit 503 until a dedicated DEV sender,
key and recipient allowlist are configured and explicitly enabled. There is
no code-returning endpoint, fake-success fallback or real-family enrollment
endpoint. The only enrollment helper accepts this verifier's synthetic marked
accounts. The web parent page was tested as described below; native devices
and actual inbox receipt have not been verified.

Do not enable real families, child profiles or subsequent High School phases
on the strength of these captured-email tests. They still need real-email
delivery and trusted enrollment, full-app/native acceptance, recovery/email-replacement design,
and full child/profile-scoped API/storage/socket acceptance checks.

## Follow-up: mail adapter and parent screen

### Merge reconciliation

The prior merge attempt timed out. A subsequent read of the source found a
pre-merge checkpoint but not the intended guard files. The preserved code was
synchronized with that checkpoint; a documentation-only conflict was resolved
without discarding either set of instructions. No merge retry or production
deployment was performed during this follow-up. Do not describe the earlier
timeout as proof that the source was unchanged.

### DEV web flow

The DEV-only `/high-school/parent-verification` page provides code requests,
four-digit entry, parent unlock/lock and separately verified password changes.
Enrolled family sessions encounter this screen before ordinary app data can
load. Their Profile also links to it. Unenrolled adult accounts do not get the
family UI. The route is not added to production's document allowlist.

Parent grants are held in memory, not local/session storage. The common API
header helper binds them to the exact account/session, clears them on logout
or account/session switching, and expires them after the server's lifetime.
Lock/expiry clears the query cache so cached parent data is not intentionally
retained for child use. Password-purpose tokens remain local to the password
form, expire after two minutes and are never reused as general parent grants.
Navigation back to the app uses SPA routing so the temporary grant is not
mistakenly lost through a full page reload.

`npx tsx scripts/verify-high-school-parent-dev.ts --browser` passed 16 operational
checks plus seven browser checks. It renders the actual parent page with an
injected synthetic browser session, sends requests to the actual DEV service,
and supplies codes from a private in-process email sink—not a public endpoint.
It tests phone layout, delivery error, incorrect/correct code entry, actual
server unlock/lock, expired password approval, mismatched confirmation and a
successful password change confirmed by DEV Auth sign-in. Desktop completion
was also captured. This is not a test of real email receipt or a native device.

The actual isolated app was started separately: the DEV page returned 200,
the unauthenticated status endpoint returned 401, and production startup was
not entered.

### Dedicated DEV email configuration

Before email setup, no sender or credential was configured and no real
verification email had been sent. A read of the available Resend connection found
no verified sending domain. Attaching the other authorized connection was
blocked because a Resend connection was already assigned. The existing
connection was not removed or replaced.

After the operator saved a separate, domain-restricted sending-only DEV key,
its presence, expected format and difference from the live mailer key were
checked without displaying any credential. The approved sender and one test
inbox were saved in development settings with sending still disabled.

The operator then approved exactly one email. The actual DEV mail adapter,
behind the strict outbound guard, submitted that message once. Resend returned
HTTP 200 with message ID `01a1f577-9c6f-794a-8870-89ba155a9a44`.
The inbox owner subsequently confirmed receipt in the conversation. This
establishes receipt of that transport test, not end-to-end parent verification
with a real inbox. The standalone transport test did not access a database,
activate a code for an account or change a password.

That transport test used the original eight-digit template. After receipt was
confirmed, the owner chose four digits with tighter limits. Generation,
validation, email-template/network policy and code-entry UI now use four
digits, including leading zeros, and describe the new two-minute lifetime.
Obsolete eight-digit input is rejected by the verification service. The
updated flow passed captured-email operational and browser tests; no further
real email was sent and receipt of the four-digit template is not claimed.

The operational test exercised concurrent guesses across two purposes and
sessions, resending after a failure, and a fresh shared-password login during
lockout. Exactly three failures were recorded; further guesses and deliveries
were blocked. Eleven-minute-old failures still blocked verification; only
after simulating expiry of the full 15-minute window for this run's synthetic
account did a still-valid code succeed. These clock changes were restricted
to the marked synthetic account and did not change the database/server clock.

Enablement existed only in the single test process's configuration. A read
afterward confirmed the project's development sending flag remained `0`.
No merge retry or deployment was performed. The current provider-acceptance
evidence is recorded separately from the captured-email browser checks in
`docs/high-school-parent-verification-results.json`.

Use a dedicated sending-only DEV credential, preferably restricted to a DEV
sending domain. Collect it through Replit Secrets, never chat:

- Secret: `DEV_RESEND_API_KEY`, distinct from the live mailer's key.
- Development-only sender: `DEV_PARENT_EMAIL_FROM`, a simple sender address.
- Development-only recipients: `DEV_PARENT_EMAIL_ALLOWLIST`, one to three
  explicitly approved test inboxes controlled by the tester.
- Enable only after setup and test-email approval:
  `DEV_PARENT_EMAIL_ENABLED=1`. Without this, the key is stripped during
  isolation and delivery remains disabled.

The outbound exception permits only HTTPS POST to Resend `/emails`, the exact
DEV credential, configured sender, a single allowlisted recipient, and the
fixed parent/password verification template. Arbitrary content, cc/bcc,
attachments, other recipients, other endpoints and redirects remain blocked.
The client never calls Resend or receives its key. Provider acceptance is not
treated as verified inbox receipt.

Draft subject: `Roster DEV: Verify parent access`

Draft body:

> DEV TEST ONLY — this message is not from production.
>
> Your verification code is: [four-digit code]
> Use this code to unlock parent-only controls in Roster DEV.
> The code expires in 2 minutes and can be used once, only in the session that requested it.
> Do not share this code with a child or anyone else.
> If you did not request it, ignore this message. No parent access or password change has been approved.

### Installation and recovery

`npx tsx scripts/install-high-school-parent-dev.ts` is a read-only status check.
The explicit `--apply` option installs only in the validated, separate DEV
database; it is not a production migration or automatic startup task. Do not
add this SQL file to a generic migration runner.

The installer verifies the three guards and schema privacy. Installation
enrolls nobody. The application refuses isolated DEV startup if its required
schema is absent instead of silently running unguarded.

Keep the guards installed when reverting application code. Removing an
enrollment or guard removes its protection; never do that as automatic cleanup
for real accounts. Recovery work must first confirm the separate DEV target
and the enrolled-account set and get authorization for any affected account.

## Historical feasibility investigation

### Status before implementation approval

The temporary DEV boundary probe passed on November 19, 2026.
At that stage application protection had not been implemented. The High School
foundation still remains gated as described in the current status above.

Production was not modified. The probe connected only to the separately
validated DEV Supabase project and created two synthetic Auth users. It
installed a randomly named, temporary private schema and Auth-user trigger.
Only the synthetic family user was enrolled in the guard. The other synthetic
user represented unchanged adult behavior. Both users, the schema and trigger
were deleted, and cleanup was verified.

## Why the settings experiment did not solve this

The earlier experiment's saved result records GET 200, PATCH 403 and restoration
verified with the original `security_update_password_require_reauthentication`
value false. It never enabled the setting.

Supabase documents a 24-hour fresh-session exemption for this setting. Someone
who knows the shared password can create a fresh session, so enabling the
setting alone cannot enforce an email code for every family password change.
Do not repeat that experiment as a proposed fix.

Reference: https://supabase.com/docs/guides/auth/password-security?output=1

## What was actually exercised

The historical `scripts/high-school-parent-boundary-proof.ts` ran before the
persistent guard was installed. Its strict preflight now refuses that installed
trigger; use `scripts/verify-high-school-parent-dev.ts` for current verification.
Do not remove the persistent protection just to rerun the historical probe.

The successful run established:

- Two separate sessions could sign in with the same family password.
- A fresh session's direct Auth password update failed, even when its request
  included forged parent metadata. The original password still worked and the
  attempted replacement did not.
- Direct SQL writes to current and pending parent-email fields raised the guard.
- An unprotected synthetic adult account could still update its password through
  Auth and sign in with the replacement.
- A server-side, captured code produced a proof bound to its account, requesting
  session, expiry and purpose. Another session or account could not verify it.
- A parent-action permission check rejected a missing, expired or wrong-session
  proof. This was a predicate test, NOT an existing application endpoint.
- Incorrect codes consumed the five-attempt allowance; expired and consumed
  challenges could not be used.
- Changing the password required a distinct password-change code. A concurrent
  replay produced only one successful mutation. The new password worked and
  the old password stopped working.
- Raw Auth password updates remained blocked after that authorized mutation.
- Cleanup removed and verified both fixtures and all temporary database objects.

The direct Auth rejection was HTTP 500, not a friendly application error. That
is expected for this database-trigger prototype and is not suitable user-facing
behavior. Assertions also checked actual sign-in results; HTTP failure alone
was not treated as proof that the password stayed unchanged.

Machine-readable evidence:
`generated-artifacts/high-school-auth-proof/parent-boundary-result.json`.

## Enforcement mechanism and trust boundary

Enrollment and approval records lived in an unexposed private schema with
schema access revoked from public, anon, authenticated, service_role and
supabase_auth_admin. The trusted database connection controlled enrollment;
client profile choices and mutable user metadata did not.

The Auth-user trigger rejected password writes unless an exact password-hash
approval existed for the same account and database transaction. The approved
write consumed that record. Creating the approval and changing the password
were one transaction, after consuming a session-bound, password-purpose proof.
No account-wide “parent verified” flag or reusable cross-session window was
opened.

The trusted application database role remains privileged. This does not
protect against compromised server/database credentials.

## Historical prototype limits

This is a CUSTOM Supabase Auth database integration, not an officially supplied
Auth hook. The owner subsequently gave DEV-only implementation approval.
The historical probe's direct bcrypt write
is a feasibility technique, not an approved replacement for provider password
policy, breach checks, audit events, notifications or session management.

The probe intentionally did not:

- Send email, create a real parent account, or exercise the email-change HTTP
  endpoint. Its mailbox was an in-memory test sink, never exposed to clients.
- Wire a parent-verification screen, parent-only application routes, database
  policies, storage paths or sockets.
- Validate a client-supplied JWT. It decoded only tokens returned directly by
  DEV Auth during the probe. Application code must verify signature, issuer,
  audience and the active session before binding any permission.
- Implement persistent attempt/resend throttling, mail delivery error handling,
  trusted enrollment or parent-email replacement workflows.
- Verify recovery, identity linking, MFA enrollment/removal, session revocation,
  logout invalidation, account deletion or every alternate credential path.
- Change existing adult behavior, production settings, managed database-role
  grants, production data, deployments or application startup.

The approved implementation above follows this foundation design: keep a private server-owned family
registry with the established parent's email; send codes only there. Add
durable account-level and session-level throttles, attempt limits and audit
records. Verify email possession before granting temporary session-specific
parent authority. Password changes need their own single-use approval, not
merely the longer-lived parent-action proof. Integrate the checks at every
parent-only boundary before claiming coverage.

Keep recovery and parent-email replacement fail-closed until verified safe
flows exist. Review managed Auth compatibility and all alternate credential
paths in DEV before advancing the High School security foundation.
