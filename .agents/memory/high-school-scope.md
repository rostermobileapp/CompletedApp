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
not only screens. Do not assume unresolved family-session, multi-team chat,
cross-league seat or guardian-identity decisions have been approved.
