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