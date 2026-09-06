---
name: Mobile game selector
description: League and season context rules for the Stats Management game picker.
---

Stats Management must expose native league, season, and game selectors rather than silently locking the page to URL or auto-selected context.

**Why:** An empty game dropdown was initially mistaken for a touch failure. The expected game existed and had a valid explicit season assignment, but the page offered no way to escape a different selected league/season context.

**How to apply:** Preserve visible league and season controls when restyling Stats Management. Fetch games by their explicit season assignment; do not infer season membership from browser-parsed dates.