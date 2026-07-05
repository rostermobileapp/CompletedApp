---
name: Draft rehydrate vs active-drafts scope
description: Mismatch between which draft statuses active-drafts returns vs rehydrateActiveDraftTimers handles
---

## Rule
`GET /api/user/active-drafts` returns drafts with status `"active" | "paused" | "awaiting_captains"`.
`rehydrateActiveDraftTimers()` only queries `"active" | "awaiting_captains"` — it skips paused drafts entirely.

**Why:** Paused drafts intentionally have no running timer. But if a draft is paused at a placeholder-keeper turn and the commissioner resumes, resumeDraft calls maybeFireScheduledAutoPick which handles the auto-pick correctly.

**How to apply:**
- If a user reports a draft "stuck" at startup after a server restart: first check if the draft is "paused" (not "active"). If paused, only a Resume action triggers recovery — the startup rehydrate won't touch it.
- Server restart mid-turn on an ACTIVE draft: rehydrateActiveDraftTimers now calls maybeFireScheduledAutoPick before restarting the timer, so keeper auto-picks fire correctly on restart.
- Draft API call silence in logs during testing: the user may have tested while the draft was in a different server log window, or the draft status was paused causing zero active-side processing.
