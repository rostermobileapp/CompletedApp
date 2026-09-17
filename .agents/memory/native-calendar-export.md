---
name: Native calendar export
description: The Natively calendar integration is a one-way, device-local export layered on top of Roster’s internal schedule.
---

Roster’s native calendar integration retrieves device calendars and creates events through Natively. Export state is local to the signed-in user on that device and is keyed by the stable Roster event source key. Each export also keeps a fingerprint of the schedule payload so reschedules and cancellations can be detected.

When a calendar provider exposes an editable event identifier plus update/delete operations, the integration can register that provider and reconcile changed or removed events. The current Natively SDK does not expose those operations, so the default remains one-way export. If mutation is unavailable or fails, retain the export record, never create a replacement duplicate, and show the Roster schedule as authoritative.

**Why:** The SDK does not currently return a documented editable event identifier or expose update/delete methods. Treating one-way export as synchronization would create stale or duplicate device events; retaining source-key records makes the conflict explicit and allows a future provider to reconcile safely.

**How to apply:** Keep the in-app schedule authoritative. Treat device-calendar export as an explicit user action, persist fingerprints and any provider event IDs locally, and only mutate events through a provider that owns the corresponding event ID. Cancellations without delete support remain visibly pending rather than being silently recreated.

The selected device calendar must be persisted through IndexedDB. Browser localStorage is only a fallback and migration path because the mobile webview may not retain it across app reloads.

**Why:** A selected calendar stored only in localStorage was lost after a phone app reload, forcing the user through setup again; the native storage bridge also caused an app-level script failure on the current mobile build.

**How to apply:** Hydrate the saved calendar asynchronously from IndexedDB before automatic sync or the calendar settings UI decides that no calendar is selected. Keep localStorage only as a migration/fallback path.