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
cross-league seat or guardian-identity decisions have been approved.

Keep shared parent credentials: the owner explicitly chose this when offered
safer child sessions as an alternative. Children knowing the parent password is
part of the threat model, not an assumption that may be removed.

**Why:** The owner confirmed the shared-login requirement after the direct
Supabase Auth bypass risk was raised. This confirms product scope, not security
feasibility or permission to weaken parent-device protections.

**How to apply:** Prove account changes and parent-authority operations cannot
bypass approved-device checks. If the proof fails, stop and report the
incompatibility; do not silently replace family authentication.

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
