---
name: Team captain data model quirk
description: Why a team can show a phantom captain (e.g. the commissioner) who isn't actually a roster member.
---

Captain status is tracked in two places that can drift apart: `teams.captainId` (legacy single-captain field) and `team_memberships.isCaptain` (multi-captain flag). `storage.getTeamCaptains()` unions both sources "for backwards compatibility," so any stale row in either place shows up as an extra captain on the roster.

**Why:** `POST /api/teams` auto-inserts the creator into `team_memberships` with `isCaptain: true` (so the team appears in their selector). If a commissioner creates team shells and later assigns real captains through a different path that only touches `teams.captainId` directly (e.g. the draft setup wizard) instead of going through `storage.setTeamCaptain`/`addTeamCaptain`, the original creator's `team_memberships` row is never cleaned up — so the commissioner keeps showing as a roster member and captain even though they never actually joined the team.

**How to apply:** When debugging "wrong person shows as captain," check both `teams.captainId` and every `team_memberships.isCaptain=true` row for that team, and cross-reference each captain-flagged user against `league_memberships.assignedTeamId` to see if they're genuinely rostered. Any code path that reassigns a team's captain should either go through `storage.setTeamCaptain`/`addTeamCaptain`, or explicitly clear `isCaptain` on `team_memberships` rows for users not genuinely on the roster.
