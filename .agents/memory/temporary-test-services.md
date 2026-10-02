---
name: Temporary test services
description: Keep isolated test services alive across shell calls without changing app workflows.
---

Run temporary test services as tracked background shell tasks, with the service itself in the foreground. A daemon that reports successful startup from a short shell call may not remain alive for the next call.

**Why:** An isolated PostgreSQL test server reported readiness but later connections were refused after the launching shell exited. A tracked background service remained available across calls.

**How to apply:** Use this for disposable local integration-test services, not the main app. Keep the existing app workflow unchanged and stop the temporary service after verification.