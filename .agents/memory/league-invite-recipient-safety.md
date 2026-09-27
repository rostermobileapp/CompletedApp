---
name: League invite recipient safety
description: Guardrails for manually added player invitations.
---

Sending league invitations must require an explicit recipient selection. Never infer the intended recipients by querying everyone without an invite ledger record. Manual addition and sending an invitation should be distinct steps, with a clear count of selected recipients before sending.

**Why:** A commissioner added two players and then clicked Send Invites. The old action sent to every eligible league member/import without a prior invite record, not just those two. The manual-add path also emailed the new players immediately, making repeat invitations possible.

**How to apply:** When introducing any bulk invite or welcome action, treat eligibility as a list of choices, not as consent to message everyone. Require a nonempty allowlist from the UI and verify each requested recipient belongs to the league on the server; deduplicate by normalized email and honor existing delivery records.