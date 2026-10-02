---
name: Trivia scheduler boundary
description: Keep trivia's independently scheduled generation outside Roster's existing deployment.
---

Use a separate scheduled project for trivia generation. Do not migrate the existing workspace or replace its web deployment to add the job.

**Why:** The owner explicitly chose the separate scheduled-project approach when offered workspace migration. This keeps Roster's existing infrastructure unchanged.

**How to apply:** Supply the new job with the same published-app database through its Secrets interface and an explicit America/New_York noon schedule. Owner publishing is separate from shipping the app feature; do not describe a documented schedule as active.