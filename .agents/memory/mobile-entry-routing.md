---
name: Mobile entry routing
description: Preserve explicit push intent through authentication and screen restoration.
---

Notification intent must take precedence over last-screen restoration, including notifications whose intended destination is Home. A bare root URL cannot distinguish a push from an ordinary app launch; retain an explicit, non-sensitive entry marker.

**Why:** During the recurring mobile 404 investigation, root-targeted pushes were found to be indistinguishable from resumable launches. Restoring another screen could silently override the push's destination.

**How to apply:** When adding or changing push destinations, test closed/background/open entry with a conflicting saved screen and delayed authentication. Keep query/hash intent through login, and never use an unrestricted query-supplied return URL.

Resolve launch aliases and saved-screen restoration together rather than through independently mounted redirect components. Unknown routes must remain observable instead of being indiscriminately redirected Home.

**Why:** Separate redirect effects can overwrite the destination selected by another lifecycle event, while blanket redirects conceal the addresses support needs to diagnose.

**How to apply:** Preserve newer navigation across pending login callbacks and distinguish fixture browser verification from actual installed-wrapper/OS push delivery.
