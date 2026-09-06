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