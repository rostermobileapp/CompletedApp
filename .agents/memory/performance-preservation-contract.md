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

For the Supabase egress effort, authentication stays unchanged and optimization order must follow measured returned bytes, not cumulative query-call counts.

**Why:** The owner approved isolated development/production environments and temporary production measurement before any optimization batch, explicitly retaining the auth boundary.

**How to apply:** Attribute queries independently to normalized routes and named worker cycles, measure calls/rows/approximate result bytes for a bounded 24–48-hour production window, remove instrumentation afterward, and propose byte-ranked batches for new approval. Do not treat application-query measurements as coverage of Supabase Auth internal SQL or as exact billed egress.

Environment separation is its own first release. Development/test must use a new nonproduction Supabase project with synthetic data, must not run production workers, and must not send live pushes, emails or billing activity.

**Why:** The owner explicitly requires isolation before measurement; scheduled-job guards alone do not protect direct/manual provider calls or startup billing/backfill activity.

**How to apply:** Verify Railway's actual production environment before changing worker guards, preserve production behavior, and keep development stopped rather than reconnecting it to production during rollback. Measurement is a later release: exact calls/rows, about 1-in-20 sampled bytes, one aggregate log line per ten minutes to existing Railway logs, fixed expiry, then a separate removal release. No new sink.
