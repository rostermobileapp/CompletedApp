---
name: Native calendar export
description: The Natively calendar integration is a one-way, device-local export layered on top of Roster’s internal schedule.
---

Roster’s native calendar integration retrieves device calendars and creates events through Natively. It does not import, update, or delete device events because the available SDK surface only documents calendar retrieval and event creation. Export state is therefore local to the signed-in user on that device.

**Why:** The SDK does not return an editable event identifier or expose update/delete methods, so pretending this is continuous two-way synchronization would create stale or duplicate device events.

**How to apply:** Keep the in-app schedule authoritative. Treat device-calendar export as an explicit user action, preserve local duplicate protection, and revisit persistent sync only if Natively adds event mutation APIs or a separate provider integration is introduced.