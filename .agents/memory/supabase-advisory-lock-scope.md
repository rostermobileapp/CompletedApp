---
name: Supabase advisory lock scope
description: Avoiding orphaned session locks with the project's pooled PostgreSQL connection.
---

Do not use session-scoped advisory locks for cross-request billing synchronization through the project's pooled Supabase connection. Use transaction-scoped advisory locks after BEGIN, with all serialized reads and writes completed before COMMIT or ROLLBACK.

**Why:** Multiple advisory locks were observed held by one idle database backend while other requests waited on it until their checked-out connections failed after roughly a minute. Calling a session unlock from the application's pooled client was not sufficient to prevent this. A newer lock namespace avoids already-orphaned session locks during rollout.

**How to apply:** When serializing external subscription reads against role writes, keep both inside one bounded transaction. Avoid accepting callbacks as entitlements or removing serialization just to make a stuck request return faster. A failed provider read must roll back without changing access.