---
name: Trivia scheduler boundary
description: Separate scheduled generation from actual noon push delivery without replacing Roster's web deployment.
---

Use a separate scheduled project for trivia generation. Do not migrate the existing workspace or replace its web deployment to add the job.

**Why:** The owner explicitly chose the separate scheduled-project approach when offered workspace migration. This keeps Roster's existing infrastructure unchanged.

**How to apply:** Supply the new job with the same published-app database through its Secrets interface and an explicit America/New_York noon schedule. Owner publishing is separate from shipping the app feature; do not describe a documented schedule as active.

Daily trivia is expected to send an actual push notification at noon Eastern, not merely generate a question.

**Why:** The owner expected a noon reminder after testing manual trivia pushes. A generation-only schedule does not meet that delivery requirement.

**How to apply:** Distinguish tomorrow's question generation from today's reminder delivery. Verify that a real sender is running and inspect provider acceptance before describing automated noon notifications as operational.