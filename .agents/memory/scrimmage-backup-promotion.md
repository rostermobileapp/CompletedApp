---
name: Scrimmage backup promotion
description: Defines how ranked backup players fill roster vacancies across all scrimmage join modes.
---

When an approved player is removed or withdraws before the scrimmage starts, the first active player on the ranked backup list is automatically moved to approved. Do not require the backup player to accept the vacancy again. This applies to Manual Approval, Pay to Play, and First to RSVP.

Full rosters must continue accepting new RSVPs into the backup queue, including after roster finalization. Manual Approval queues the RSVP immediately; Pay to Play queues it after payment is confirmed; First to RSVP auto-approves while capacity remains and queues later RSVPs once full.

**Why:** The organizer already approved and ranked the backup list. A withdrawal should fill the open roster spot immediately and tell the promoted player that someone dropped out and they are now in.

**How to apply:** Never reject an eligible RSVP solely because the approved roster is full; queue it, preserve ordering, and notify. Show organizer queue controls in every join mode and promote position 1 atomically after a vacancy.