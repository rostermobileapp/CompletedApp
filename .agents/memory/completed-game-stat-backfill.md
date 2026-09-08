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