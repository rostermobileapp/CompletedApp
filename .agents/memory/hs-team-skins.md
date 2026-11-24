---
name: HS team-scoped skins
description: Owner's active-team skin, child restrictions and no-background-loading requirements.
---

HS/Youth skins follow the active team and verified role on that team, not the
account's global role or billing tier. The same person may be a parent on one
team, a manager on another and an adult player on a third. Adult teams keep
the existing application. Children always get the player skin.

**Why:** The owner supplied these explicit requirements on November 24, 2026,
and asked for planning first with approval before implementation.

**How to apply:** Keep one skin resolver with normalized context inputs. Do
not change global account roles to choose a skin, or apply an HS skin to an
unrelated adult team. Make the current team and role visible in the header.

All HS skins must avoid loading patches, achievements, Trophy Case, Daily
Trivia, streaks, odds, beer counters and beer statistics. Children additionally
cannot reach payments, billing, settings, account changes, DMs or arbitrary
groups; their profile is view-only and chats are Team/Family only.

**Why:** Hiding controls is explicitly insufficient: the owner requires no
background queries/subscriptions for hidden features and API-level child
restrictions.

**How to apply:** Isolate mounts, providers, polling, sockets, prefetch,
overlays and direct routes as well as menus. Keep child authority separate
from parent login credentials and paid coverage. Staff-only identities must
not enter HS player rosters, RSVPs or stats; preserve unrelated adult playing
memberships.

Child chat is limited to the approved Team group shared with coaches and
teammates, and the child's own Family conversation with their parent. No
coach/teammate direct messages, new conversations or custom groups.

**Why:** The owner explicitly clarified these participants and restrictions
when continuing from the skin foundation on November 24, 2026.

**How to apply:** Enforce read/reply and room membership server-side, not just
in the composer. Coach and teammate replies belong in the same approved Team
thread; Family access never grants access to unrelated parents or staff rooms.
Preserve disabled child activation until its separately approved phase.

The owner approved Phase 1 with canonical nonproduction membership roles and
team program types, not runtime role inference from onboarding drafts.
Approved synthetic staff/parent/child records may be migrated; this does not
authorize real child activation. Stop for approval before every later phase.

**Why:** The owner explicitly corrected the proposed adapter-only approach.

**How to apply:** Read canonical role/program fields for skin decisions;
onboarding records are a migration input, not the runtime role authority.

Keep nonproduction-only canonical fields out of the main production Drizzle
mappings until a production migration is separately approved.

**Why:** Normal whole-table selects would otherwise request columns that do
not exist in production, breaking the adult app despite a DEV-only installer.

**How to apply:** Use explicit isolated-DEV SQL and narrowly parameterized
canonical-context queries. Never run this installation from startup, publish
or post-merge setup. Preserve the established adult selector's eligibility
rules instead of recreating them when adding mixed-team switching.

Saved team selections are hints, not authority. If one becomes unavailable,
offer the actor's remaining approved teams without implicitly entering adult
mode or requiring a reload.

**Why:** A stale selection after revocation or account switching can otherwise
hide the only team switcher and permanently lock out an authorized account.

**How to apply:** Test both a selected membership disappearing and a different
account inheriting a saved selection, including accounts with adult teams.

Fundraisers are a payment-request type, not a separate permission or feature.
Use the existing creation rules and 5% + 50¢ fee. A fundraiser adds a goal,
lets payers choose an amount and continues accepting contributions past the
goal until the creator or authorized staff closes it. In-app contribution
identities/paid-unpaid participation are hidden from everyone, including the
creator; show only total, goal and count. Stripe retains receipt/refund records.

**Why:** The owner explicitly removed the proposed coach toggle and separate
fundraiser permission on November 24, 2026.

**How to apply:** Extend the existing Payments create flow in its later approved
phase; do not build fundraisers as part of the skin foundation.
