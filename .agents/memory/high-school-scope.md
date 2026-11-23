---
name: High School scope boundaries
description: Owner-supplied High School product constraints and phase-by-phase approval rules.
---

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
one use, five wrong attempts, and approval on an approved parent phone before
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

**How to apply:** Keep activation blocked until the pairing protocol and
shared-credential/provider boundary have explicit acceptance. Distinguish
synthetic UI/service checks from native or real-provider evidence, and never
put the secret setup code in a URL.

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

Keep shared parent credentials: the owner explicitly chose this when offered
safer child sessions as an alternative. Children knowing the parent password is
part of the threat model, not an assumption that may be removed.

**Why:** The owner confirmed the shared-login requirement after the direct
Supabase Auth bypass risk was raised. This confirms product scope, not security
feasibility or permission to weaken parent-device protections.

**How to apply:** Prove account changes and parent-authority operations cannot
bypass approved-device checks. If the proof fails, stop and report the
incompatibility; do not silently replace family authentication.

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

One sponsoring league's seat covers a household across all High School leagues;
other league pools must not consume duplicate seats for that household.

**Why:** The owner explicitly chose one sponsor across HS leagues rather than a
separate household seat in each league.

**How to apply:** Keep this coverage restricted to HS contexts, not unrelated
adult leagues. League admins must approve sponsor selection and replacement,
as explicitly chosen by the owner. Never automatically allocate another
league's capacity. Without approved replacement or verified household Pro,
block new joins; settle existing-access behavior before onboarding.

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
Adding a family context to an existing completed adult remains blocked.

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

## Age question after the signup form

Show the separate age screen after the user taps Sign Up, but create an account
only after an explicit Yes. Store that adult answer on the created account.
No opens parent-led Under 18 handling without registering an account.

**Why:** The owner explicitly selected “Wait for Yes” when asked whether an
account should exist before the age answer. This preserves the existing
no-self-registration boundary for minors; there is no account on which to save No.

**How to apply:** Keep this in isolated DEV onboarding, preserve the existing
adult post-signup flow, and do not move account creation ahead of the age answer
or create restricted minor accounts without a new explicit decision.
