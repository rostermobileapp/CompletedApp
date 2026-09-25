---
name: Birthday overlay delivery
description: How an in-app birthday greeting differs from its push notification on native WebViews.
---

Birthday push delivery and the in-app greeting are independent. A successful push does not prove the active device has loaded the latest frontend, nor that the greeting query has refreshed after the native app resumes. Do not block an eligible greeting while an unrelated badge check is still loading.

**Why:** A push arrived while the birthday API reported the greeting as eligible, but the on-screen overlay did not appear. Native WebViews can resume without a normal browser focus event, and transparent VP9 confetti is not reliably supported across their video decoders.

**How to apply:** Refresh birthday eligibility on focus, pageshow, and visibility restore; let the birthday card show while the badge check is unresolved; use a native-compatible CSS animation for birthday confetti, respecting reduced-motion settings. Keep push-sent and popup-dismissed state separate.