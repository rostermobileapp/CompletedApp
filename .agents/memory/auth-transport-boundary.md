---
name: Authentication transport boundary
description: Distinguish temporary network failures from rejected credentials during preview and app startup.
---

Treat a failed network request or temporarily unavailable auth service as a
transport problem, not proof that a stored session is invalid. Clear credentials
only after a definite session/refresh rejection. Keep server-side token
verification on every protected request; a client session only selects the UI.

**Why:** Intermittent preview fetch failures previously triggered token refresh
and session clearing, turning a temporary connection problem into another login.
Many mounted consumers also amplified account initialization requests.

**How to apply:** Keep initialization shared across consumers, let newer login
and logout events override pending initialization, and never weaken backend
verification to improve startup speed. Keep user-creation/sync changes separate.
