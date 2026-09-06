---
name: Mobile game selector
description: Mobile-shell interaction constraint for the Stats Management game picker.
---

Use a native HTML selector for the Stats Management game picker rather than the shared Radix selector.

**Why:** In the mobile app shell, the Radix menu can display game options but fail to commit a tapped option. This was reproduced after the game data and season filtering were already correct.

**How to apply:** Preserve native select behavior for this picker when restyling Stats Management. Fetch games by their explicit season assignment; do not infer season membership from browser-parsed dates.