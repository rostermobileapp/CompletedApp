---
name: Drizzle array parameter bindings
description: Why interpolating JavaScript arrays into typed PostgreSQL array expressions can break batch queries.
---

Bind JavaScript arrays as a single SQL parameter when using PostgreSQL `unnest` or `ANY`; plain Drizzle template interpolation is not equivalent to an array parameter.

**Why:** A read-only reproduction using the installed Drizzle dialect expanded a two-element interpolated array to `($1, $2)::text[]`. PostgreSQL rejected the record-to-array cast with SQLSTATE `42846`, blocking completed-game follow-up work before predictions ran. Explicit single-parameter binding succeeded. Boolean-to-integer casts were tested and were not the cause.

**How to apply:** For batch queries, inspect the compiled SQL and test multiple IDs, not just a singleton. Use explicit array parameter binding rather than changing valid casts or treating the resulting failure as a database schema problem.
