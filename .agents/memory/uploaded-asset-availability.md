---
name: Uploaded asset availability
description: Preview failures from missing tracked uploaded images during unrelated feature work.
---

Tracked images in attached_assets were observed disappearing during unrelated badge work, including images still imported by application pages. The cause was not established.

**Why:** Vite can start serving and then fail pre-transforming a page that imports a missing image, even when a build completed before the image disappeared. Such a failure does not establish that the recent feature code is broken.

**How to apply:** If a preview fails with a missing @assets import, check whether the referenced tracked image is still present and recover only the required images when appropriate. Avoid restoring unrelated deleted uploads without knowing why they were removed.