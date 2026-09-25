---
name: On Fire season streak
description: Season boundary and historical attendance rules for goal-scoring streak badges.
---

On Fire measures the longest run of completed games with a goal within one season, not a career-wide run or a run that crosses seasons. An attended game without a goal breaks the run; an attributed goal also counts as an appearance when old game records have no attendance row. Older global awards stay visible as history but never advance a selected season's tier progress.

**Why:** The previous career metric combined seasons and required attendance rows even when goals were recorded. That could hide real scoring games and unlock the wrong tier in a new season. Legacy stat rows can also refer to deleted users despite current foreign-key declarations, so a historical backfill must check that users still exist before inserting progress.

**How to apply:** Use the game's assigned season rather than calendar year, select a season in the Trophy Case, recalculate after goal edits or game finalization, and keep each event's season and tier-specific artwork together. Backfills should not replay old announcements or try to award deleted users.