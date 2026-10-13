---
name: In-app message email policy
description: Delivery-channel boundary for chat notifications.
---

In-app messages must never trigger email, including when push is unavailable, disabled, or fails.

**Why:** The owner explicitly set this product boundary after a group-chat burst generated excessive email.

**How to apply:** Keep chat notifications in-app and/or push only. Do not use email as a fallback; unrelated transactional email remains allowed.
