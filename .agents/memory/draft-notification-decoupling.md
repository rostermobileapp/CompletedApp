---
name: Draft notification delivery must be decoupled from roster assignment
description: Why "notify players" actions in the draft flow need their own delivery-tracking state, not a check against team assignment
---

The draft engine treats roster **assignment** (drafts → team_memberships) and
**notification delivery** as two different concerns that must never share the
same "already done" check.

**Why:** Drafts auto-complete (via `completeDraft`, triggered from
`advanceTurn`/timeout paths) the instant the last pick lands — this already
assigns all players to teams. If a later manual action (e.g. a commissioner
"Finalize & Notify" button) gates its notification send on "is this player
newly assigned to a team," it will find zero newly-assigned players by the
time anyone clicks the button, and silently send no notifications at all —
with no error, since the assignment step legitimately succeeds/no-ops.

**How to apply:** Any "notify" action tied to a process that can also
complete/assign automatically elsewhere needs its own independent
`notifiedUserIds`-style ledger (persisted column, checked before sending,
updated after a confirmed successful send) so retries/re-clicks only target
users who have not yet been *successfully notified* — never inferred from
assignment or membership state.
