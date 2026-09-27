---
name: Shared external database test safety
description: A connected external database may contain the same records observed by the production app.
---

Treat the workspace's external database connection as potentially shared with the live app. Do not run mutating integration tests, cleanup fixtures, broad startup backfills, or trial SQL against it unless isolation has been positively established.

**Why:** A production deploy error referenced an orphan player also present in the workspace database, and a live league's missing team was observed and repaired through that same connection. Test fixture cleanup using generated IDs did not target that team, but running those tests against shared data was an avoidable risk.

**How to apply:** Use read-only investigation first. Verify a dedicated test database before any integration test that inserts or deletes records. For live restoration, make minimal, guarded, transactional writes and verify affected IDs and link counts. Never infer production isolation from the connection's availability in a development workspace.