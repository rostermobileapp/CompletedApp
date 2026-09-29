---
name: RevenueCat webhook URL uniqueness
description: Why native production and sandbox events share one signed endpoint in a single RevenueCat project.
---

RevenueCat webhook integration URLs must be unique within a project. For this app's shared backend, use a single HMAC-signed integration without an environment filter for both production and sandbox events. Validate the signed payload's environment; a production server acknowledges sandbox events without granting paid access from sandbox receipts.

**Why:** RevenueCat's webhook creation API rejects a second integration at the same URL. Separate production/sandbox signing secrets on one URL therefore cannot be configured as originally intended. Sharing one signing secret does not make sandbox receipts production purchases.

**How to apply:** When changing webhook configuration, keep one native URL and one HMAC signing secret unless distinct endpoints/backends are intentionally introduced. End-to-end sandbox entitlement tests require a development or staging backend, not a production entitlement grant.