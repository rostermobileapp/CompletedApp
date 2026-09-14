---
name: Team-specific jersey numbers
description: Jersey numbers belong to a user's approved team memberships and must be resolved per team.
---

Jersey numbers are team-specific, not a global user-profile attribute. A player may use different numbers on different teams, and scorekeeper displays must use the number for the roster's team. Profile editing/display should only expose numbers for active-season teams that are not linked to completed tournaments.

**Why:** The same user can belong to multiple teams, so a single profile-level number would show the wrong player number in some games.

**How to apply:** Read and update the approved team or league-assigned membership rows for the relevant team. When both membership models exist for the same team, keep their values synchronized because roster lookup can encounter either row. Filter closed-season and completed-tournament teams only at profile presentation/editing boundaries so historical reporting remains available.