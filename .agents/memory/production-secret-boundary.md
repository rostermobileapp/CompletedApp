---
name: Workspace versus production secrets
description: Billing readiness must be checked in Railway production independently of Replit workspace secret presence.
---

Treat Replit workspace secrets and Railway production secrets as separate configurations.

**Why:** An Apple checkout investigation found all required names present in the workspace but absent from the running Railway service. The workspace signing credential also failed validation, so copying existing entries without validating them would not resolve readiness. The owner confirmed native App Store checkout completed after correcting the full `.p8` contents and redeploying Railway without an iPhone app rebuild, but subsequently reported missing Commissioner access. Checkout completion and signing readiness are not evidence that subscription activation succeeded.

**How to apply:** Check deployed secret names without retrieving values, and use safe readiness checks that return only status. Do not infer production readiness from workspace presence or bypass checkout verification when configuration is unavailable.

The available Railway integration cannot execute commands in a live service container; its diagnostic sandbox is a separate runtime.

**Why:** A runtime signing-key check could not be executed through the integration. Successful deployment, quiet logs, and sandbox results were insufficient to validate the deployed key.

**How to apply:** Use authenticated readiness, authorized Railway SSH, or a sanitized startup self-test for live validation. Do not treat a sandbox check as production evidence or retrieve private-key values to work around missing execution access. A new diagnostic requires deploying its updated source build; redeploying the previous image only refreshes that old build.