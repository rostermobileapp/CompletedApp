---
name: Scrimmage change recipients
description: Defines recipients for scrimmage changes, cancellations, and newly reopened spots.
---

Scrimmage change and cancellation pushes go to the deduplicated union of players who actually received an invitation and players whose join request is approved. Exclude the organizer.

**Why:** Direct invite IDs and current invite-group membership are not a reliable history of who was actually invited. Groups can change after delivery, while persisted invite notifications preserve the delivered registered-user audience.

**How to apply:** For organizer edits or cancellations, resolve recipients before deleting source rows. Use delivered invite records/notifications plus approved requests, and do not alert selected recipients whose invite has not yet been delivered.

When an approved player leaves, send a vacancy alert to delivered invitees only if the roster changed from full to open. Exclude approved players, explicit declines, and backup players; backups stay on the ordered backup notification flow.

**Why:** Alerting on every departure creates noise when space was already available. Re-alerting declines ignores their response, while notifying backups outside their queue can produce duplicate or out-of-order offers.

**How to apply:** Measure capacity before deleting the approved request. After deletion, alert unanswered and pending delivered invitees, and independently continue the existing backup cascade.

Co-host assignment notifications are role notifications, not player invitations, and must be delivered immediately even when the scrimmage time is TBD.

**Why:** A co-host may be responsible for choosing the missing time; deferring their notification until a time exists prevents them from doing that work.

**How to apply:** On every co-host addition path, create the in-app notification and send the push using the known date plus “time TBD.” Keep only player invitation delivery deferred.