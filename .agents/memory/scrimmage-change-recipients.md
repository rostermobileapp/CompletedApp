---
name: Scrimmage change recipients
description: Defines who receives push notifications when an organizer changes or cancels a scrimmage.
---

Scrimmage change and cancellation pushes go to the deduplicated union of players who actually received an invitation and players whose join request is approved. Exclude the organizer.

**Why:** Direct invite IDs and current invite-group membership are not a reliable history of who was actually invited. Groups can change after delivery, while persisted invite notifications preserve the delivered registered-user audience.

**How to apply:** For organizer edits or cancellations, resolve recipients before deleting source rows. Use delivered invite records/notifications plus approved requests, and do not alert selected recipients whose invite has not yet been delivered.