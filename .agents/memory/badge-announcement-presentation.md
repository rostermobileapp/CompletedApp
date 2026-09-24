---
name: Badge announcement presentation
description: How earned-badge announcements should relate to the screen where the achievement happened.
---

Earned-badge announcements are global, full-screen overlays: center the announcement card and strongly blur the existing screen through a translucent backdrop. The ice photograph belongs to the Trophy Case page, not to the global announcement backdrop.

For tiered awards, carry the awarded tier's image path in both live and persisted events. The badge definition image can be Bronze artwork, so using it without the tier override makes higher-tier announcements display the wrong medal.

**Why:** The user wants the moment of achievement to appear immediately over the screen where it was triggered (for example, logging a milestone beer), with that same screen still visible but heavily blurred; each tier must also show its own artwork.

**How to apply:** Keep the host at app level; avoid route-specific announcement backgrounds. Preserve real-time earned-event delivery, reconcile pending events, and resolve legacy tier events to their tier-specific image. When pending data refreshes, replace queued events with matching IDs instead of treating them only as duplicates, because corrected payloads must reach cards already in memory.