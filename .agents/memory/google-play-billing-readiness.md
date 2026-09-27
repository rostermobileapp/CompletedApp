---
name: Google Play billing readiness
description: Why native subscription products and server-side purchase activation must be validated independently.
---

Do not treat a price returned by a native Google Play/RevenueCat bridge as evidence that the app can activate the resulting purchase. The native billing configuration and the server's Android Publisher verification credential are separate external prerequisites; a management OAuth connection also must not be assumed to configure the app runtime.

**Why:** During an Android upgrade outage, the native product lookup was inconclusive, while the workspace definitely lacked the credential required by its Google Play verification endpoint. A successful native charge without functioning server verification could leave a buyer without access.

**How to apply:** Check product discovery, the server verification capability, and an actual license-tester purchase/restore independently. Fail closed before payment when verification is unavailable; do not replace native checkout with an unreviewed off-store flow.