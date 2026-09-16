---
name: Team stats query isolation
description: React Query cache and authorization rules for team roster stats.
---

Team roster stats must use a cache key distinct from league-wide stats, even when both are used for team leaders. A shared key can hydrate an opponent page with the current team's filtered response and make roster-card matching fail.

**Why:** The Teams page and TeamView previously shared a key while calling different endpoints, so opposing roster cards had no matching stats despite a valid stats API.

**How to apply:** Use a team-id-specific key for `/api/teams/:id/stats`; allow free users to query their own team only, and require premium or commissioner access for opponent-team stats.

The endpoint must also be exercised when a team has placeholder players. Correlated placeholder queries should use explicit table aliases; otherwise the SQL driver can emit an ambiguous `id` error and fail the entire stats response, including registered players.

**Why:** A placeholder-row query failure caused the roster stats request to return HTTP 500 for teams that otherwise had valid registered-player stats.

**How to apply:** Keep placeholder-player stats in an explicitly aliased SQL query and verify the endpoint with both placeholder and registered roster members.