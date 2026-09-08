---
name: Completed-game stat backfill
description: Rules for adding goal, assist, and penalty details after a final score already exists.
---

Completed games remain editable in the scorekeeper. When a historical game has a recorded score but incomplete goal rows, preserve the recorded score while details are backfilled.

**Why:** Deriving the scoreboard immediately from an empty goal list would erase the saved final score before the scorekeeper finishes entering historical details.

**How to apply:** Keep the recorded score until entered goal totals catch up. Mark completed-game mode clearly and allow the same goal, assist, and penalty controls used for live scoring.

Finalization may increment season totals only from goal and penalty rows that were not previously submitted.

**Why:** Reopening and saving a completed game must not count previously finalized goals or assists a second time.

**How to apply:** Capture unsubmitted events before submission, build aggregate stat increments only from that pending set, and treat repeated saves as idempotent.

Substitute scorers and substitute assists are unattributed participants: the goal event still counts toward the game's score, but no individual goal or assist is awarded for a substitute selection.

**Why:** A game score must remain accurate even when the player is not registered, while season leaderboards must only reference real user accounts.

**How to apply:** Store substitute participant references as null, keep the goal row itself, load scorer relationships with a left join, and skip null participant IDs during stat aggregation.

Submitting event rows, incrementing player totals, and marking the game completed must be one database transaction.

**Why:** If event rows are marked submitted before a later stats write fails, retries can skip those events and permanently lose valid player totals.

**How to apply:** Lock the game during finalization, validate participant references, perform every related write in one transaction, and recover incomplete games whose events were prematurely submitted by older code.

Authorized Scorekeeper finalization counts as official score verification and must clear the league's verification alert.

**Why:** Game completion and detailed stat submission are stronger evidence than a separate captain score entry; requiring both leaves already-finalized games in the alert queue.

**How to apply:** Upsert a commissioner-override score submission in the finalization transaction and invalidate both game-verification and notification-count queries on success.