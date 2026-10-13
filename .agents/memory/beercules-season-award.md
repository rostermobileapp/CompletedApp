---
name: Beercules season award
description: Product rules for the season-long beer leaderboard patch.
---

Beercules belongs in the Trophy Case's Season Awards category. Sum recorded beer counts by player and league season; when the season is complete, award all tied leaders if the high score is above zero. This is independent of Beer Me, which resets by calendar year.

**Why:** The user specified a season-total award that is granted automatically after completion, distinct from the existing calendar-year beer badge.

**How to apply:** Keep Beercules eligibility season-scoped and idempotent. Do not reuse Beer Me's annual evaluator or reset behavior.
