---
name: Placeholder player orphaned teamId
description: placeholder_players rows can have team_id pointing to deleted teams, making players invisible everywhere in League Management.
---

## The Rule
When fetching placeholder players, null out any `teamId` that points to a team that no longer exists in the `teams` table.

**Why:** If a placeholder has a non-null `teamId` for a deleted team it is silently invisible: `!assignedTeamId` is false so it's not a free agent, and no real team has that ID so it never appears under a team either.

**How to apply:** Already fixed in `getLeaguePlaceholderPlayers` (server/storage.ts). The LEFT JOIN on `teams` produces a null `resolvedTeamId` when the team was deleted. The loop checks `r.ph.teamId !== null && r.resolvedTeamId === null` and returns the placeholder with `teamId: null`, making it a free agent automatically.
