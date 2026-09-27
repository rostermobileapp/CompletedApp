---
name: Badge artwork cache busting
description: Why artwork replacements need a new URL even when the public image file changes.
---

When shipped badge artwork is replaced in place, change the catalog image URL as well, for example with a versioned query string.

**Why:** Reusing the same image URL can leave an installed webview or browser showing an older bitmap even after the server serves the new file. An announcement preview showed older artwork while the current public asset and separately stored images were correct.

**How to apply:** Version the affected tier's canonical artwork URL and make sure existing catalog records are synchronized with it. Confirm the versioned URL serves the intended image.