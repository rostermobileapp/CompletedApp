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

The in-app trivia popup must also wait until noon America/New_York every day, including for founder/test accounts and already-cached questions.

**Why:** The owner reported receiving the popup at 11 AM and explicitly stated that it must not display until noon. A noon push schedule alone does not constrain in-app presentation.

**How to apply:** Treat popup release separately from question generation and account eligibility. Recheck at noon, day rollover, and app return; use Eastern daylight-saving rules, not a fixed UTC offset.

Before public launch, automated test announcements are limited to U00001. The owner has now approved public play and daily announcements to the full eligible audience at the launch time documented in replit.md. A noon announcement is independent of whether today's trivia was already answered.

**Why:** The owner first authorized U00001-only testing, then explicitly requested a timed public rollout. They expected a noon notification even after completing the day's question.

**How to apply:** Keep the prelaunch test audience restricted, then broaden play and pushes together. Do not suppress the daily announcement using answer or dismissal state without an explicit policy change. A scheduled source change is not a live launch until deployed.

Users may opt out of Trivia pushes independently of in-app Trivia and all other notification types. Missing Trivia-specific consent preserves the previous enabled behavior, but never overrides the master push opt-out.

**Why:** The owner requested a Trivia push toggle in profile notification preferences, not a global switch that removes Trivia from the app. Preserving omitted settings also prevents older clients from undoing a user's opt-out.

**How to apply:** Respect this choice during recipient selection, claim, final eligibility checks, and provider delivery. Keep partial preference updates from resetting omitted choices; leave in-app play, announcements, and patch progress unchanged.