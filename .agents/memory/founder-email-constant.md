---
name: Founder email constant
description: The correct hardcoded email to use for founder-only gate checks on the frontend
---

The founder/admin account's real login email is `tobin@rosterhockey.com` (display ID `U00001`). The server-side `requireFounder` middleware in `server/routes.ts` already uses this correctly.

**Why:** Several frontend components independently hardcoded a stale `founder@rosterhockey.com` value for founder-only gating (e.g. redirecting away from an admin page, or hiding founder-only UI). Since it never matched the real session email, those checks silently failed — e.g. clicking "App Statistics" in the menu would redirect straight back to the home screen because the page's own gate check didn't match.

**How to apply:** When adding or auditing any founder-only check on the frontend, do not hardcode the email inline — if you must, use `tobin@rosterhockey.com` exactly, or better, derive founder status from `displayId === 'U00001'` or the `feeExempt` flag (whichever the surrounding code already uses) to avoid another stale duplicate constant.
