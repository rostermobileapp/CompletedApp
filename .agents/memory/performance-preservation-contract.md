---
name: Performance preservation contract
description: Owner's safety and approval requirements for Supabase egress and load optimizations.
---

Performance optimizations must not change features, displayed data, stored records, or responsiveness. Existing display IDs must remain unchanged. Do not delete or rewrite existing records to reduce traffic.

**Why:** The owner explicitly made preservation the overriding requirement of the Supabase egress work; savings do not justify behavior changes.

**How to apply:** Investigate read-only and present findings, request counts, and polling inventory before implementation approval. If preservation cannot be established, report the tradeoff and leave the candidate unchanged.

Authentication changes, RLS changes, Supabase project-setting changes, and destructive schema require specific prior approval. Never deploy authentication-verification changes and user-creation/sync changes together.

**Why:** The owner requires isolated, reviewable risk boundaries, especially around account access and identity preservation.

**How to apply:** Work in separately revertible batches of one or two related items. After each batch provide before/after call counts and approximate bytes, exact manual flows to check, and reversal instructions. Remove temporary logging. Never infer permission for a security tradeoff from general performance approval.
