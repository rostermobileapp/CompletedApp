---
name: Native frontend deployment timing
description: Independent frontend and backend publication during native device testing.
---

For native webview tests, verify the public frontend is serving the intended JavaScript bundle **and** the API deployment is healthy before asking for a device retry. Do not infer frontend freshness from a successful backend deployment or a new GitHub commit.

**Why:** The web frontend and API deploy independently. An iOS retry made after the Railway API was healthy but before Vercel published the corresponding frontend produced a false negative; a later backend deployment was marked successful while its API still briefly returned 502 during startup.

**How to apply:** Check a changed, non-sensitive marker in the public frontend's hashed bundle and confirm the API responds normally. Wait for both conditions before interpreting a native retry, and avoid claiming a deployment is ready based on provider status alone.