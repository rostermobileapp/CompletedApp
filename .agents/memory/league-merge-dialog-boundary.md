---
name: League merge dialog boundary
description: Why league user-account merging and legacy player replacement need separate preview eligibility
---

The commissioner merge dialog selects only active league user accounts with U IDs, but the older player replacement workflow must still be able to review placeholder-backed users without U IDs. Keep their preview eligibility separate, while retaining the existing conflict checks in the shared merge transaction.

**Why:** Applying dialog-only candidate rules to the replacement confirmation can prevent commissioners from safely reviewing and replacing older placeholder-backed members.

**How to apply:** When changing league merge candidate or preview validation, check both the user-only dialog and the legacy replacement confirmation path; do not widen the dialog to make replacement work.

The user's duplicate-account consolidation request is account-wide, not an expansion limited to league history. Approvals, announcements, invites, duties, reminders, and badges should be eligible for classified transfer in that full-account operation, not blocked merely because records exist.

**Why:** On 2026-10-13 the user clarified that the goal is to combine accounts while choosing the login email and username/profile used to access the combined account.

**How to apply:** Use the account-wide merger for this goal; keep the legacy league-only/replacement workflows distinct. Apply the commissioner authority and tier policy in account-merge-safety-boundary.md, with original attribution and review-required conflicts preserved.