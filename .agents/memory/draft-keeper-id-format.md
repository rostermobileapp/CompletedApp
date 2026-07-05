---
name: Draft keeper ID format
description: Format differences for placeholder player IDs across draft-related tables
---

## Rule
`draft_keepers.placeholder_player_id` stores the **full prefixed string** `"placeholder:{uuid}"`.
`draft_picks.placeholder_player_id` stores the **bare UUID** (applyPick strips the prefix at line ~1015).
`placeholder_players.id` is always a bare UUID.

**Why:** The two tables were designed differently. draft_keepers stores the full composite ID as-is from the client/keeper wizard. applyPick normalizes to bare UUID before inserting into draft_picks for consistency with the picks query.

## Rank for placeholder keepers
`draft_keepers.rank` is the primary source for which round to auto-pick a placeholder keeper.
`placeholder_players.skill_level` is the fallback. **Both were null in early builds** because `draftRoutes.ts` was dropping `rank` from the DB insert for placeholder keepers (it was only saving rank for real-user keepers). Fixed: both insert paths now include `rank: rank ?? null` for placeholder keepers too.

**How to apply:**
- When adding to keeperSet from draft_keepers: `keeperSet.add(k.placeholderPlayerId)` — NOT `keeperSet.add(\`placeholder:${k.placeholderPlayerId}\`)`.
- When querying placeholder_players by the draft_keepers value: strip prefix first → `k.placeholderPlayerId.replace(/^placeholder:/, "")`.
- When checking draftedSet from draft_picks: add the prefix → `draftedSet.add(\`placeholder:${p.placeholderPlayerId}\`)`.
- buildAutoPickSchedule and maybeFireScheduledAutoPick expect the full prefixed form `"placeholder:{uuid}"` as the playerId.
- If a placeholder keeper's rank is null in an existing draft, the auto-pick will silently skip. Fix: UPDATE draft_keepers SET rank='N' for that row.
