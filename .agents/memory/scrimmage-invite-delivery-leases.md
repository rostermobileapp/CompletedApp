---
name: Scrimmage invite delivery leases
description: Delivery-state and concurrency rules for scheduled and immediate scrimmage invitations.
---

Treat `inviteSentAt` as proof that the full occurrence delivery completed, never as proof that recipients were merely selected or that a worker started.

**Why:** Recurring occurrences must remain private and independently retryable until their own notifications, announcements, pushes, and emails finish. A timestamp-only expiring lease allowed a stale worker to overlap a replacement and duplicate external sends. Broadcasting a Home refresh before completion races the refetch against `inviteSentAt`, so the push can arrive while the invite card stays hidden.

**How to apply:** Any delivery path must claim a stable owner token, heartbeat it, revalidate before every side effect, and token-conditionally complete/release. Preserve successful recipient/channel markers across retries; clean legacy pre-delivery artifacts once in migration, never on every claim. Expose queued/TBD rows only to creators and co-hosts. Emit recipient schedule/cache refresh events only after the completion write succeeds, and invalidate both the scrimmage-invites and upcoming-games Home queries.