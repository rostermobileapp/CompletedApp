---
name: Demo client identity
description: How client-side identity checks must behave while Demo POV impersonation is active.
---

In Demo mode, use the selected copied POV user ID for client-side ownership, membership, and captain comparisons. The Supabase session user remains the real authenticated account and is not the effective Demo user.

**Why:** The server swaps the effective API identity to the copied POV user while preserving the real actor for security. Supabase's client session does not change, so comparing records to the session user hides valid POV controls and can expose controls based on the real actor.

**How to apply:** Any client permission or ownership display that compares a resource user ID with the signed-in user must select the Demo POV ID when Demo is active. Keep server authorization as the final enforcement layer.