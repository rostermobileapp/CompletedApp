---
name: Placeholder user identity
description: How to distinguish placeholder-backed user accounts from registered users.
---

Treat a row in `users` as a placeholder-backed account when its email ends in
`@placeholder.roster`; do not query a boolean `users.is_placeholder` field.

**Why:** Placeholder identity differs by model: the users table has no
`is_placeholder` column, while the separate placeholder-player and
imported-player models do have explicit placeholder fields.

**How to apply:** Whenever logic operates on the `users` table itself, use the
placeholder email convention. Only use an `isPlaceholder` column on a model
whose schema actually declares one.