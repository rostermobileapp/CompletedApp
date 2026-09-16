---
name: Team stats query isolation
description: React Query cache and authorization rules for team roster stats.
---

Team roster stats must use a cache key distinct from league-wide stats, even when both are used for team leaders. A shared key can hydrate an opponent page with the current team's filtered response and make roster-card matching fail.

**Why:** The Teams page and TeamView previously shared a key while calling different endpoints, so opposing roster cards had no matching stats despite a valid stats API.

**How to apply:** Use a team-id-specific key for `/api/teams/:id/stats`; allow free users to query their own team only, and require premium or commissioner access for opponent-team stats.