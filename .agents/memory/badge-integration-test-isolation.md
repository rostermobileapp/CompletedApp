---
name: Badge integration test isolation
description: Why database-backed badge tests with global reconciliation need serial execution.
---

Run badge integration tests that invoke global historical reconciliation serially against the shared development database.

**Why:** Parallel tests can delete their fixture users while another test's reconciliation is inserting progress or awards for those same users. This produces foreign-key errors or causes a live test award to be silently backfilled before its event assertion; the tests pass individually.

**How to apply:** Execute each database-backed badge test file in a separate, sequential command unless the tests have isolated databases or the reconciliation is scoped to their fixtures.