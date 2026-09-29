---
name: CARTO tile failure mode
description: Why a basemap can be broken despite successful network responses
---

CARTO's former unauthenticated basemap tile endpoint can return an image that literally says “API KEY REQUIRED” with HTTP 200 and image/png. A generic availability check that only examines status or content type will report a false success.

**Why:** The landing-page heat overlay continued to render while the basemap was replaced by repeated error-image tiles, even though direct requests for the tiles succeeded at the HTTP level.

**How to apply:** When diagnosing map tiles, visually inspect a representative tile as well as network responses; use a legitimately accessible tile source and show its required attribution.