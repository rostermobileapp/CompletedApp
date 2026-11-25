---
name: Production hosting boundary
description: Distinguishes the live Railway app from Replit workspace and preview status.
---

The Roster live app's production errors and daily trivia sender are visible in Railway's production environment even when Replit reports no active deployment for this workspace. The Replit development preview is not the live app.

The public APP frontend is served through Vercel; Railway serves its API/backend
runtime. Check both hosts when verifying a release.

**Why:** Live readiness checks showed Vercel frontend responses and a separately
versioned Railway backend. Updating one does not prove the other is current.

**How to apply:** Confirm frontend route/metadata behavior publicly and inspect
the actual Railway release separately. Do not interpret absent Replit deployment
metadata as absence of the external production services.

**Why:** During the October 2026 trivia tap investigation, Replit deployment metadata showed no active deployment while Railway showed matching live app and push-delivery logs.

**How to apply:** Check Railway for production incidents and verify the deployed version there. Do not infer that local workspace changes are live, and do not redeploy without user authorization.

Do not attribute service-wide Railway logs to the latest deployment merely because the tool's response labels that deployment as successful. Service-wide logs span older deployments.

**Why:** A merge review appeared to fail after its fix was deployed, but deployment-scoped logs showed the last review ran on the old server before the replacement began serving. The service-wide response displayed the latest successful deployment above those older requests.

**How to apply:** For reports that a deployed fix still fails, compare request timestamps with the new server's startup time and query logs scoped to its deployment ID before assuming another code defect or asking for another publish.

Check frontend/backend release compatibility before changing working feature code.

**Why:** A newer mobile frontend displayed award-loading errors and unavailable predictions while the live Railway backend still lacked the awards endpoint and the newer prediction model. Successful Replit preview requests did not validate that live backend.

**How to apply:** Check the actual production API for newly introduced routes and response contracts. A frontend-only release cannot enable features that require a newer Railway backend; do not hide that mismatch with synthetic stats or disabled-feature fallbacks.

Backend-only releases must exclude unpublished frontend ancestors, not just
unstaged frontend files.

**Why:** Workspace checkpoint commits can already contain frontend work that the
owner has not published through Vercel. Adding only backend files to a new commit
does not remove those earlier frontend commits from its pushed history.

**How to apply:** Compare local history with Railway's remote source branch
before pushing. If frontend work is ahead locally, package the approved backend
delta against the current remote tip and reconcile local history without losing
workspace changes. Do not force-push, change hosting configuration, or include
the frontend merely to trigger a backend release.
