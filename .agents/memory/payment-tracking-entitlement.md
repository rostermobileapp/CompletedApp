---
name: Payment tracking entitlement
description: Entitlement boundary between creating invoices and managing invoices that already exist.
---

Organizers must be able to view, refresh, and confirm payment requests they own even when they do not currently have premium access. Premium access gates creation of generic payment requests, not management of existing or system-created scrimmage invoices.

**Why:** Pay-to-play scrimmages can create organizer-owned invoices through the scrimmage workflow. Blocking the organizer's created-payment view prevents them from confirming player-reported payments and can also block first-to-pay admission.

**How to apply:** Keep generic invoice creation controls and server authorization premium-gated, while allowing authenticated creators to track and confirm their existing requests. Treat recipient-updated payment state as cross-device data that must refresh rather than remain indefinitely cached.