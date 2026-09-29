---
name: Database provider
description: The PostgreSQL database is hosted on Supabase, not Neon.
---

The project uses Supabase for PostgreSQL hosting. The `DATABASE_URL` environment variable points to a Supabase connection string.

**Why:** replit.md previously said "Neon Database" but the user confirmed this was wrong — it is Supabase.

**How to apply:** Use the same database connection source as the running app. Do not reference Neon in documentation or troubleshooting notes.

Manual PostgreSQL clients that use default `PG*` environment settings may connect to a different database with similarly named but outdated tables. For direct app-data investigation, use the app's configured `DATABASE_URL` through the database driver, without printing its value.

**Why:** A read-only lookup through the default driver settings saw a schema missing active app columns; the app's configured connection showed the expected data.

**How to apply:** If a query result conflicts with the running app, verify the connection target before interpreting the result or making account changes.

The serverless PostgreSQL driver's pool forwards idle-client errors to the pool, but removes that forwarding listener while a client is checked out. A dropped WebSocket can therefore emit an uncaught client `error` and terminate the API even when query failures are caught.

**Why:** A pool-level error listener alone did not stop repeated production crash loops during connection drops.

**How to apply:** Preserve a client-level error listener for every pooled connection as well as the pool-level listener. Do not swallow rejected queries; let callers handle failures and the pool discard broken clients. Check both idle and checked-out paths when changing database drivers.
