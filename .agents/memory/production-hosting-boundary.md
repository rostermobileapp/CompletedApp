---
name: Production hosting boundary
description: Distinguishes the live Railway app from Replit workspace and preview status.
---

The Roster live app's production errors and daily trivia sender are visible in Railway's production environment even when Replit reports no active deployment for this workspace. The Replit development preview is not the live app.

**Why:** During the October 2026 trivia tap investigation, Replit deployment metadata showed no active deployment while Railway showed matching live app and push-delivery logs.

**How to apply:** Check Railway for production incidents and verify the deployed version there. Do not infer that local workspace changes are live, and do not redeploy without user authorization.

Do not attribute service-wide Railway logs to the latest deployment merely because the tool's response labels that deployment as successful. Service-wide logs span older deployments.

**Why:** A merge review appeared to fail after its fix was deployed, but deployment-scoped logs showed the last review ran on the old server before the replacement began serving. The service-wide response displayed the latest successful deployment above those older requests.

**How to apply:** For reports that a deployed fix still fails, compare request timestamps with the new server's startup time and query logs scoped to its deployment ID before assuming another code defect or asking for another publish.
