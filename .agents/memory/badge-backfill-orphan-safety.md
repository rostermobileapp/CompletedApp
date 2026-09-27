---
name: Badge backfill orphan safety
description: Historical score records can outlive users and crash badge startup reconciliation.
---

Before award or progress backfills insert user-scoped rows, restrict their candidate IDs to users that still exist. Keep historical games and goals intact; do not manufacture user rows or delete score records to satisfy badge foreign keys.

**Why:** Completed-game scoring data can still hold a deleted user's ID. A startup badge backfill treated that ID as eligible and raised a foreign-key error while inserting an award, preventing the server from starting.

**How to apply:** Join candidate queries to users before awarding or updating progress, especially when candidate IDs come from goals, stars, attendance, scrimmage requests, or imported history. Conflict-ignore inserts do not suppress foreign-key violations.