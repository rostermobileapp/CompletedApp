---
name: Mobile game selector
description: League and season context rules for the Stats Management game picker.
---

Stats Management must expose league and season selectors rather than silently locking the page to URL or auto-selected context. Its game picker must use a fixed in-app button list, not the phone's native select overlay.

**Why:** An empty game dropdown was initially caused by hidden context. After that was fixed, the mobile shell's native select overlay visibly shook and mapped taps to the following row instead of the row touched.

**How to apply:** Preserve visible league and season controls and the fixed, scrollable in-app game list when restyling Stats Management. Fetch games by explicit season assignment; do not infer season membership from browser-parsed dates.