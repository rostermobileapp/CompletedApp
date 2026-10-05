---
name: Database provider
description: The PostgreSQL database is hosted on Supabase, not Neon.
---

The project uses Supabase for PostgreSQL hosting. The `DATABASE_URL` environment variable points to a Supabase connection string.

**Why:** replit.md previously said "Neon Database" but the user confirmed this was wrong — it is Supabase.

**How to apply:** Use the same database connection source as the running app. Do not reference Neon in documentation or troubleshooting notes.

Database health is transport-specific: a successful native PostgreSQL query does not establish that the running application's database connection is healthy.

**Why:** The app's WebSocket connection has disconnected or timed out while a native client could still read the same Supabase catalog. One unhandled connection error stopped the preview independently of the static artwork changes being verified.

**How to apply:** Check the running app's logs alongside direct SQL checks when diagnosing preview failures. Distinguish connection-path failures from missing assets or incorrect catalog data; don't change correct artwork mappings to address a database transport error.

A successful non-TLS native probe is not sufficient justification for changing the application's secure database transport.

**Why:** Native read-only probes succeeded, but a certificate-validated TLS probe failed with a self-signed certificate-chain error. Replacing the existing secure connection with plaintext or disabling certificate verification would weaken security rather than fix connection resilience.

**How to apply:** Verify the provider's trusted CA and certificate-validated TLS before considering a native-transport migration. Preserve the existing secure transport until that prerequisite is met; never disable certificate verification just to make a connectivity check pass.

Manual PostgreSQL clients that use default `PG*` environment settings may connect to a different database with similarly named but outdated tables. For direct app-data investigation, use the app's configured `DATABASE_URL` through the database driver, without printing its value.

**Why:** A read-only lookup through the default driver settings saw a schema missing active app columns; the app's configured connection showed the expected data.

**How to apply:** If a query result conflicts with the running app, verify the connection target before interpreting the result or making account changes.
