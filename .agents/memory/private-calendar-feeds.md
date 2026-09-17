---
name: Private calendar feeds
description: Security and lifecycle rules for reusable web calendar subscription URLs.
---

Web calendar subscriptions need a reusable bearer URL because calendar providers cannot send the app's browser session. Store only a cryptographic hash of the token, keep one active token per user, and make regeneration replace the existing token so the old URL stops working immediately.

**Why:** A feed URL is equivalent to a password: storing or returning the raw token from the server increases the impact of a database read, while allowing multiple active rows makes revocation and account cleanup ambiguous.

**How to apply:** Return the raw URL only when creating or regenerating it, require an authenticated session for token lifecycle actions, and serve the feed only when the hashed token resolves to a non-revoked user-specific row.