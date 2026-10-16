---
name: Temporary test services
description: Keep isolated test services alive across shell calls without changing app workflows.
---

Run temporary test services as tracked background shell tasks, with the service itself in the foreground. A daemon that reports successful startup from a short shell call may not remain alive for the next call.

**Why:** An isolated PostgreSQL test server reported readiness but later connections were refused after the launching shell exited. A tracked background service remained available across calls.

**How to apply:** Use this for disposable local integration-test services, not the main app. Keep the existing app workflow unchanged and stop the temporary service after verification.

Pin every local database connection parameter, including the role, rather than trusting inherited workspace PostgreSQL defaults.

**Why:** Workspace `PG*` variables were inherited by local PostgreSQL tools, selecting a role that did not exist in a freshly initialized test cluster despite the explicit local host and port.

**How to apply:** Use an explicitly isolated host, port, database, role, and SSL policy for both command-line clients and test-driver connection URLs. Keep guards that reject any non-local test database.

Tests that use the app's Neon serverless pool cannot connect directly to a plain local PostgreSQL server, even when `psql` can.

**Why:** The application pool uses Neon’s WebSocket transport; a standard local PostgreSQL listener accepts native PostgreSQL connections, not that transport.

**How to apply:** Use a Neon-compatible isolated test endpoint or a deliberate test-only adapter. A successful `psql` probe does not establish that app integration tests can connect.

When generating disposable fixture schemas with the installed Drizzle Kit API under Node 20, load its CommonJS API through `createRequire` rather than its ESM entry.

**Why:** The installed ESM bundle throws `Dynamic require of "fs" is not supported` before schema generation; the CommonJS entry works with the same schema and API.

**How to apply:** Use this only for isolated test setup. Generate the schema into `/tmp` and apply it solely to the guarded local test database, never the application's database.