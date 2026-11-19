---
name: High School scope boundaries
description: Owner-supplied High School product constraints and phase-by-phase approval rules.
---

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
