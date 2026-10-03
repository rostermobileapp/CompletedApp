---
name: Workspace versus production secrets
description: Billing readiness must be checked in Railway production independently of Replit workspace secret presence.
---

Treat Replit workspace secrets and Railway production secrets as separate configurations.

**Why:** An Apple checkout investigation found all required names present in the workspace but absent from the running Railway service. The workspace signing credential also failed validation, so copying existing entries without validating them would not resolve readiness.

**How to apply:** Check deployed secret names without retrieving values, and use safe readiness checks that return only status. Do not infer production readiness from workspace presence or bypass checkout verification when configuration is unavailable.