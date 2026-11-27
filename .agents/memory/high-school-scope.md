---
name: High School scope boundaries
description: Owner-supplied High School product constraints and phase-by-phase approval rules.
---

## Current adult/child authentication boundary

Children use approved child-device sessions and setup codes, not the parent's
adult sign-in password. This supersedes the older shared-login requirements and
security investigations below, which are historical rather than current scope.
Normal adult commissioner/coach actions must not require a parent email code.
Family/child approvals and password changes retain separate parent authority.

**Why:** On 2026-11-27 the owner approved this replacement after shared
credentials caused Family protections to block ordinary league administration.

**How to apply:** Before release, any previously shared adult password must be
changed once. Do not infer that choosing this model changed any password.
Keep provider signature/session verification, real league/team permissions,
restricted child capabilities and parent revocation independently enforced.

## Child profiles before team connection

An approved child device must stay signed in across app shutdown and reopening,
until the parent revokes access. Do not tie its continuing approval to the
parent's provider login remaining active, or require routine code re-entry.

**Why:** On November 25, 2026, the owner reported that every app restart asked
for the parent code and explicitly required the child to stay logged in unless
the parent revokes access.

**How to apply:** Persist only the restricted child-device capability, never
parent verification authority. Keep initial pairing short-lived and protected
by current parent approval. Revalidate child revocation, consent and applicable
team/coverage permissions server-side on every request. Temporary connection
failures must preserve the saved login. Distinguish browser process-restart
tests from actual installed-native-app acceptance. A token already lost before
this behavior was installed cannot be recovered by inventing child identity.

The owner requires birth year, makes graduation year optional, and wants a child
profile/device set up before joining a team. The child's phone needs only the
setup code, never a separate setup link. Collect the year only, not a full
date of birth. A later invitation through the parent's account must populate the
same child's existing phone session, not create a second child or require pairing
again.

**Why:** During restricted production testing, the owner explicitly identified
team-first activation as the wrong product flow and requested independent setup.
The owner subsequently confirmed a missing birth year had blocked consent and
explicitly requested optional graduation and code-only phone setup.
This supersedes the earlier requirement that approved team membership and
coverage precede all child pairing, not the restricted rollout or child-safety
requirements.

**How to apply:** Require saved guardian consent and verified-parent device
approval for baseline profile access. Continue to require canonical approved
membership and payer-scoped coverage for team schedules/chats, and revalidate
them on reads. Preserve stable household identity through invitation claims.
When graduation is unspecified, match only exact, unique household names; reject
ambiguous matches in either direction rather than combining children.
Keep the selected-account rollout and two-player limit, and obtain specific
approval before applying additional production schema changes.

## Adult UI parity for child-accessible features

Every function available to a child must mirror the adult account's design and
UI. Parent-child conversations must also use the normal adult chat presentation
on both sides, not a separate Family dialog or simplified child-chat design.

**Why:** On November 27, 2026, the owner explicitly rejected both chat designs
and required adult UI parity for every child-accessible function.

**How to apply:** Reuse real adult presentation components and styles with the
restricted child transport. Shared appearance does not authorize adult APIs,
payments, arbitrary contacts, or unsupported controls. Keep existing child
permissions and verified-parent boundaries intact.

## Parent-child conversations

An approved child must automatically appear as a named private conversation in
the parent's Messages, regardless of which adult team, school team or All teams
selection is active. It must work before the child has a team or team coverage.
Each child has a separate conversation, not a shared sibling/household history.

**Why:** On November 26, 2026, the owner reported that setup left no conversation
for messaging their child and requested a thread named for that child in every
team selection. Separate threads avoid mixing siblings' private messages.

**How to apply:** Keep both directions connected to the same private history.
Derive ownership from canonical guardian/child records, not adult roster
membership or placeholder accounts. Preserve verified-parent and child-device
revocation boundaries. Keep conversations out of Demo and visual-only previews;
do not add email notifications for chat.

## Restricted production onboarding testing

For the next testing round, the owner designated this setup on November 27, 2026:
- **U00001:** admin of a new High School league, and parent of a child on the
  coach's team.
- **U00250:** coach in that same league.

**Why:** The owner explicitly asked to retain this arrangement for future
testing, covering league administration, coaching and parent-child access.

**How to apply:** Use this relationship when preparing future test scenarios.
This records the intended setup only; it does not authorize creating the league,
changing account roles, enrolling a child or modifying production data.

The owner wants to test the complete onboarding and coach/parent journeys in
production, restricted to explicitly selected existing test accounts rather
than all users. The owner will handle the Vercel frontend deployment.

**Why:** After requesting production age-first signup, the owner clarified
that the other journeys must also be testable and selected a limited set of
accounts. This is not approval for a public school-feature rollout.

**How to apply:** Enforce eligibility on the server, not through client account
claims or a visible-link check. Preserve existing adult accounts and canonical
staff authority; do not reset onboarding or grant roles to make a test pass.
Obtain specific approval before installing additional production schema/Auth
changes. The later child-activation authorization below supersedes the
earlier disabled-child scope for the restricted production test only.

## Restricted production child activation authorization

The owner explicitly corrected the disabled-child scope: “No... Activate
child login and device activation.” Include both in the selected-account
production test, not in a public rollout for every Family account.

**Why:** The earlier restriction no longer reflects the owner's requested
test scope. It does not remove parent verification, consent, canonical team
approval, coverage or child-only authority requirements.

**How to apply:** Pair with the setup code alone, followed by verified-parent
approval; a separate setup link is no longer required. Keep child capabilities
separate from shared provider credentials and discard parent authority when
entering child mode. A shared password or UI flag never authorizes activation.
Verify production storage, released backend/frontend and real-device behavior
separately; implementation or local tests alone do not establish live readiness.

## Parent verification usability

Avoid requiring another emailed parent verification code on every ordinary
return to child setup. The owner also requires that, once a child is already
set up, the parent can manage that child without another verification code.

**Why:** The owner explicitly objected to repeated parent-screen timeouts and
having to enter a new verification code every time.

**How to apply:** Improve continuity on a verified parent device without granting
parent authority from the household's shared login. The owner selected a fixed
30-day duration on November 25, 2026. Require initial email verification on a new
parent device; sign-out, locking, revocation and child-mode entry end remembered
access. Keep password changes separately verified and short-lived.
An existing child profile alone is not evidence that the person using the
shared login is the parent; preserve the parent-device and child-device boundary.

Parent verification must always offer an exit, including midway through setup.

**Why:** The owner explicitly rejected signing out as a navigation action:
“You should just be able to go back to the home screen! Don't sign the parent out!”

**How to apply:** Always offer Back to Home without signing out, clearing device
approval or changing saved family setup, including when verification is locked or
unavailable. Home means the actual existing app dashboard, not a replacement
Family landing page; the owner explicitly rejected that substitute. Do not
immediately reopen the verification gate. Normal authenticated account reads
must work without parent proof, while family/child controls and mutations retain
their server-side verification. Preserve active-session and canonical membership
checks; navigation never grants parent authority.

Keep the reusable remembered-device proof out of JavaScript-readable storage.

**Why:** Parent and child can share provider credentials, and longer-lived parent
approval must not become another transferable household-login field.

**How to apply:** A same-origin HttpOnly device proof must still be checked against
the authenticated account/session and revocation state. Retain compatibility with
temporary proofs for clients and transports that cannot send the first-party
cookie; do not break real-time updates when changing parent authentication.

## Authorized live family rollout (November 24, 2026)

The owner now wants family setup in the live app for “Every account that has an
age of 21+ per DOB.” Use recorded DOB, not paid plan, account role, existing adult
team membership or completed adult onboarding. Missing/invalid DOB must not
silently qualify. Shared credentials and parent/provider protection remain;
child sign-in and device activation were excluded from that broader rollout.
The subsequent selected-account activation approval does not extend to all
eligible Family accounts.

**Why:** This explicit request supersedes the earlier production prohibition
for the family rollout only. It does not approve unrelated High School phases.

**How to apply:** Prepare and verify production-safe account protection,
recovery, mail delivery and schema prerequisites rather than removing DEV flags.
Observe the separate requirement to explain and authorize specific live
Auth/schema changes before applying them. Preserve unrelated adult behavior.
Use the application's New York calendar for DOB boundaries, not a caller's
chosen timezone; February 29 reaches the threshold on March 1 in non-leap years.

The owner subsequently selected **Authorize protected production rollout**
after reviewing the private-family-storage, parent/child-membership and
enrolled-account Auth changes, including safe email recovery and existing-provider
compatibility before installation. This authorizes those scoped production
changes after verification; do not ask for the same approval again.

Live family enrollment must remain pending until parent-email possession is
proven. Disabling new enrollment must not remove existing family protection.

**Why:** The shared-login boundary must not lock ordinary adult accounts when
mail delivery fails, or disappear merely because a rollout switch is disabled.

**How to apply:** Preserve staged activation and independent existing-family
protection when changing enrollment, recovery, release flags or account access.
It does not authorize automatic enrollment or child-device activation.

## Revised onboarding export (November 23, 2026)

The owner supplied a 25-screen High School / Youth export and explicitly requested
planning first, with implementation only after approval. The new specification
removes signup's age Yes/No question, inserts hockey type before Role, separates
adult roles from staff/parent/HS league-admin roles, and keeps adult behavior
otherwise unchanged. These revisions do not authorize production activation.

**Why:** The export supersedes the earlier signup-question design, but does not
authorize production changes or silently remove the shared-parent-credential
requirement. Its claimed adult profile ordering differs from current routing.

**How to apply:** Resolve the ordering conflict before changing adult routing.
Rebuild with existing components, not pasted reference HTML. Child-device setup
codes use six alphanumeric characters excluding 0/O and 1/I, ten-minute expiry,
one use, failed-attempt limits, and approval on an approved parent phone before
any child access. Keep these separate from parent email-verification codes.
Child sessions remain restricted to their own profile, schedule and authorized
Team/Family chats; no parent access, payments or coach messaging. HS League Plan
pricing remains unspecified; iOS seats show status only, with no web-buy links.

Plain six-character code entry cannot attribute an arbitrary wrong guess to a
particular child's challenge. Do not describe per-IP throttling as a complete
five-wrong-attempts-per-code guarantee.

**Why:** The exported manual-entry flow specifies a per-challenge lock, but
identifies the challenge only through the secret being guessed. A separate
challenge reference changes that protocol and needs owner approval.

**How to apply:** The owner explicitly chose code-only entry on November 25,
2026. Retain the five-failure server-derived source throttle and failure caps on
located challenges, but do not claim that unknown-code guesses count against a
particular child's code. Code redemption only requests verified-parent approval;
it never grants a child session directly. Preserve the shared-credential/provider
boundary. Distinguish synthetic UI/service checks from native or real-provider
evidence, and never put the secret setup code in a URL.

High School behavior is opt-in by `teams.program_type = 'high_school'`; existing
adult/beer-league teams must retain their behavior, including for adults who
also participate in a school team.

**Why:** The owner called this the golden rule in the supplied High School
requirements. A proposed global 18+ signup gate is an unresolved exception,
not permission to change all existing adult onboarding.

**How to apply:** Scope capabilities, queries, workers, caches and notifications
to the verified acting profile and team/program. Do not globally disable adult
features for an adult merely because they also have an HS role.

Use the separate nonproduction Supabase project for all HS development, and
obtain explicit approval for each build phase before beginning it.

**Why:** The owner requested an audit and phased plan only, with separate
approval for every phase and no production development.

**How to apply:** Do not use the live-project preview opt-in for HS work.
Planning, accepting a design choice, and approving implementation are distinct.

Children are non-login family profiles, not ordinary adult accounts; do not
collect their email, phone, address or date of birth. Consent and restricted
visibility precede active team participation. No person may create a private
DM or arbitrary group containing a child, including staff.

**Why:** These are explicit minor-safety requirements, not optional UI choices.
The requested shared-password/device-approval design requires a proven Auth
security boundary; a profile picker alone must not be treated as that proof.

**How to apply:** Enforce restrictions in database/API/storage/socket paths,
not only screens. Do not assume unresolved security feasibility,
coverage-loss access or guardian-identity decisions have been approved.

The original shared-parent-credentials requirement was superseded by the
owner's approved child-device/setup-code model on 2026-11-27.

**Why:** The owner chose separate child capabilities so an adult can retain
commissioner and coach access without repeatedly unlocking Family controls.

**How to apply:** Require a one-time password change for any previously shared
adult credential before release. Parent-only operations still need approved
parent proof; ordinary adult actions use authenticated, permissioned sessions.

Do not assume the shared-password model is secure under the DEV Auth settings
tested on 2026-11-19: direct password takeover succeeded without parent approval.

**Why:** A real temporary-account exercise confirmed a fresh password login
could replace the password, use the replacement, and invalidate the original.
Application device checks cannot protect an independently exposed Auth endpoint.

**How to apply:** Keep the foundation blocked until an owner-approved mitigation
passes direct Auth attacks. This finding concerns the tested configuration,
not proof that every possible Supabase configuration is insecure.

Require an email verification code sent to the parent's existing email before
a High School family password change. Shared parent credentials remain.

**Why:** The owner chose email-code verification after discussing whether
knowing the shared password should permit changing it.

**How to apply:** Enforce verification at the actual password-mutation boundary,
not only in the app UI, and test fresh-login bypass attempts. This does not
authorize changing adult-account behavior or production/provider settings.

Supabase's built-in secure-password-change reauthentication exempts sessions
created within the last 24 hours, so it cannot require a parent email code
on every shared-password password change.

**Why:** Supabase Auth's password update handler checks the session age before
requiring a nonce; a fresh password login falls inside the exemption.

**How to apply:** Do not treat enabling the global setting or adding an app
email-code screen as an enforced HS password boundary. Obtain owner approval
for a different, isolated authentication architecture or revised requirement
before building the protected family flow.

The owner subsequently approved a custom DEV-only Auth database guard. The
private guard and server verification implementation were exercised against
synthetic DEV family/adult accounts, including direct password updates, separate
password-purpose codes, expiry/replay/session binding and session revocation.

**Why:** The explicit approval was “Implement DEV guard (recommended)” in the
continuation conversation. This supersedes the need to ask again for that same
DEV guard; it does not authorize production or real-family activation.

**How to apply:** See `docs/high-school-parent-verification-dev.md` for the
current implementation/evidence and limitations. Real email delivery remains
disabled, no existing account is enrolled, and child/profile access is not
implemented. Do not mistake captured-email verification for delivery to a real
parent. Keep High School activation gated and production untouched.

The follow-up added the DEV-only parent code/password screen and dedicated,
allowlist-restricted mail adapter. The actual page passed captured-email
browser checks against the DEV service; 44 focused tests and the build passed.

**How to apply:** A separate DEV sender, single test-inbox allowlist and
`DEV_RESEND_API_KEY` are now configured. One explicitly approved transport
test was accepted by Resend, and the inbox owner confirmed receipt.
This was transport-only, not a full real-inbox parent verification exercise.
Persistent DEV sending remains disabled. Do not send again without approval,
reuse live mailer credentials or replace an existing connector. The earlier timed-out
merge did not put the intended files in the source as of the follow-up read;
the saved implementation was preserved and synchronized, with no merge retry
or production deployment. Consult the current evidence document before
assuming source state or claiming real email receipt.

The owner chose four-digit DEV codes after reviewing the tradeoff. Keep their
two-minute expiry and account-wide maximum of three failed guesses per rolling
15 minutes, including across resends, sessions and both purposes. This stricter
policy passed captured-email operational/browser tests, including concurrent
guesses and fresh-login lockout. No additional real email was approved or sent;
the previously confirmed transport receipt used the earlier eight-digit format.

The league administrator approves the first school staff member (athletic
director or head coach); school creation must not grant self-approval.

**Why:** The owner selected league-administrator approval to establish the
initial trusted school authority.

**How to apply:** Require verified league authority for this initial approval.
Pending staff have no roster access; later staff approvals retain their
separately specified role hierarchy.

Children may join each approved team's system Team chat plus their household's
Family chat, not only two conversations total.

**Why:** The owner explicitly chose each team's chat plus Family for multi-team
players, resolving the original "exactly two chats" wording as two categories.

**How to apply:** Preserve the prohibition on child DMs and custom groups.
Do not infer permission for temporary call-up chat access from this decision.

Coach imports may create restricted, expiring invitation staging before
guardian consent, but not active child profiles.

**Why:** The owner approved restricted staging to support roster-claim
invitations while retaining consent-before-activation.

**How to apply:** Grant no active roster visibility or app/chat access until
authorized guardian claim and consent. Verify the school's authority to supply
the details separately; product approval does not establish a legal basis.

League-paid seats are intended to cover only teams in the paying league.
Personal subscriptions cover the parent's own approved teams and their
household's eligible child teams, with the two-player limit retained.

**Why:** On November 24, 2026, the owner supplied revised payer-scoped coverage
requirements. These replace the earlier cross-HS-league household sponsorship
rule; they do not authorize implementation or activation without approval.

**How to apply:** See [Player Pro coverage policy](player-pro-coverage-policy.md).
Keep league administrators' authority and parent/child safety checks separate
from entitlement. Never auto-purchase or allocate another league's seats.

## Approved guarded DEV onboarding phase (November 19, 2026)

The owner approved "Build guarded DEV onboarding": entry selection, DEV-only
18+ gating before all new self-signups, staff requests, parent player intake
with per-player consent, and resumable drafts. Existing adult options remain.
No real registrations/families, production changes, outgoing email/push or
purchases are enabled. Shared credentials and parent-email verification remain;
automatic parent-device approval from the original document is superseded.

Implemented in a separate private `hs_onboarding` DEV schema; authenticated HS
mutations require server-owned synthetic fixture metadata and reserved-domain
confirmed email. New HS-only accounts are blocked from legacy adult APIs and
sockets; completed adults adding staff intake retain unrelated adult access.
Primary onboarding and additive family setup are different journeys; never
reset or repurpose a completed adult's original intake to enroll their children.

## Existing adults must support family setup

Existing adult-league/team users must be able to add parent responsibilities
and set up children using their current account, without a second login or
losing their adult teams, history, subscription or adult playing experience.
Parent status is additive and the active verified team/profile controls the
experience; it must not convert the account globally into a parent-only account.

**Why:** On November 24, 2026, the owner explicitly said this needs to be an
option for a user already part of an adult league and team. The earlier
completed-adult enrollment block is an implementation gap, not intended
product behavior.

**How to apply:** Use a separately approved additive, resumable family journey.
Preserve parent/provider/device protections and prove adult API/socket
authority for the approved adult session without allowing a child who knows
the shared password to enter adult mode. Keep production and real-child
activation outside that approval.

Imported player identities stay immutable, but the parent's unsubmitted copy
must be disposable even when its invitation is expired or revoked. Submitting
one invitation must not prevent setting up a second child below the limit.

**Why:** Identity protection must not permanently trap a parent in an unusable
draft or incorrectly treat a submitted invitation as unfinished intake.

**How to apply:** Require current parent authority and conflict checks for
discarding. Preserve team-staged records, submitted requests and household
counts while allowing the parent to start an ordinary unsubmitted draft.

## Earlier guarded onboarding limitations

Staff requests use league approval for initial school authority and scoped
AD/Head Coach approval thereafter. Player imports/claims remain restricted
staging/intake, not active child profiles. Self-entry stops for protected staff
review; new-school approval can stop at team setup, otherwise coverage remains
pending. Seat allocation, protected chats, real notifications and child access
are not implemented by this phase.

`/high-school/onboarding-preview` is a DEV-only, memory-only screen review:
no Auth or API mutation and no real parent authority. Real guarded flow:
`/high-school/onboarding`. See `docs/high-school-onboarding-dev.md` for precise
boundaries and validation instructions. Do not describe Section 2 or native
acceptance as complete.

The earlier parent-code merge was reconciled successfully against source commit
`7031f064` before this phase; the preserved copy was synced without losing its
previous changes. Real-inbox parent/password acceptance remains deferred.

## Age question before signup credentials

Show the separate age screen **before any new-signup email/password fields**.
Yes reveals the signup form; only submitting that form creates the account.
Store the adult answer on the created account. No opens parent-led Under 18
handling without requesting credentials or registering an account.

**Why:** The owner corrected the earlier credentials-first implementation:
“before putting in an email and password, the Under 18 Yes or No screen needs
to appear.” The previously approved no-self-registration boundary for minors
still applies; there is no account on which to save No.

**How to apply:** Keep this in isolated DEV onboarding, preserve the existing
adult post-signup flow and existing-user sign-in, and never put new-signup
credentials ahead of the age question or create restricted minor accounts
without a new explicit decision. Apply the same order to the Replit walkthrough.

## Adult profile visual alignment

Family plans use the Player Pro price and cover at most two players. The
two-player limit also applies throughout family setup, not only the plan copy.

**Why:** The owner explicitly requested Player Pro pricing for the family plan
and selected "Limit family setup to two" when asked about the former four-player
intake allowance.

**How to apply:** Keep plan copy, add/remove controls, draft validation and
invitation claims consistent. Reject oversized submissions without silently
deleting or truncating existing player drafts. This does not activate billing.
For isolated PDF captures, supply a verified, dated public-price snapshot:
the capture harness stubs the price API, so a working live-price query alone
does not establish that the exported PDF shows the correct amounts.

Do not render a "DEV Preview" top bar or screen-selection dropdown on any
onboarding screen, including development preview routes.

**Why:** The owner explicitly rejected these toolbars on the actual profile
and questionnaire screens, not only in exported PDF screenshots.

**How to apply:** Keep any internal state-seeding links separate from the
visible UI. Do not restore developer navigation bars for walkthroughs or
captures, and do not remove real onboarding content to eliminate a toolbar.

The owner authorized matching the adult profile's three screens to the newer
onboarding's visual style, not consolidating or reordering the adult journey.
Keep its fields, validation, persistence and profile-to-questionnaire handoff.

**Why:** The request was specifically that the adult profile looked visually
out of style. The agreed change was presentation only, despite the separately
identified overlapping questions elsewhere in onboarding.

**How to apply:** Treat future questionnaire deduplication, field removal and
route/order changes as separate decisions. Matching the newer intake's look
does not make adult profiles part of the High School authority or family model.

## Light onboarding auth and verification

Family setup and all coach/staff pages should use the existing light,
blue-accented onboarding design, not separate teal themes or typefaces.

**Why:** The owner flagged the live Family setup page as inconsistent with the
design theme, then explicitly requested the same consistency on all coach pages.

**How to apply:** Reuse onboarding typography, colors and controls across family
and staff screens without changing global theme or security behavior. Preserve
practical dashboard widths for coach tools rather than forcing a phone-width frame.

Keep signup/sign-in dialogs, signup email verification and every parent
verification state in the same light design as the onboarding, even when the
surrounding app uses dark mode. Apply the light styling locally, not globally.

**Why:** The owner explicitly requested light styling for E03–E05 and V01–V09
to match most onboarding screens. This is a presentation change, not approval
to change verification, passwords, account creation or parent authority.

**How to apply:** Keep portal-rendered dialogs inside their own local light
boundary. Preserve code lengths, resend limits, grants, expiry, guards and all
existing security behavior; do not change the user's global theme.

The light requirement includes the entire background outside the auth dialog,
not just its white panel. Use white or off-white for that full-screen surface.

**Why:** The owner rejected E03–E05 with white panels over jet-black backgrounds.
Leaving the dark modal backdrop was not considered a light onboarding design.

**How to apply:** Review the full screenshot, including the area below and around
the dialog. Keep unrelated app dialogs' backdrops unchanged.
