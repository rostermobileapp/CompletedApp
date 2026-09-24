---
name: Direct SQL beer-count badge updates
description: How direct database changes to beer counts reach the badge evaluator.
---

Changes made directly in PostgreSQL cannot invoke the TypeScript badge evaluator. Capture them transactionally in a durable queue, then let the app worker run the existing evaluator and announcement flow.

**Why:** Database triggers cannot execute application code, and an in-memory notification could be lost if the app is offline or restarts.

**How to apply:** For beer-count changes, queue affected users with their game season; preserve work across retries and cover inserts, count edits, deletes, and user/game reassignment.