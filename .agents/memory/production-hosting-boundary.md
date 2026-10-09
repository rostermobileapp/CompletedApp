---
name: Production hosting boundary
description: Distinguishes the live Railway app from Replit workspace and preview status.
---

The Roster live app's production errors and daily trivia sender are visible in Railway's production environment even when Replit reports no active deployment for this workspace. The Replit development preview is not the live app.

**Why:** During the October 2026 trivia tap investigation, Replit deployment metadata showed no active deployment while Railway showed matching live app and push-delivery logs.

**How to apply:** Check Railway for production incidents and verify the deployed version there. Do not infer that local workspace changes are live, and do not redeploy without user authorization.
