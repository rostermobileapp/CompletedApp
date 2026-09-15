---
name: Goalie stat fallback
description: How goalie stats must handle completed games, missing goalie records, and placeholder goalies.
---

Completed games are not guaranteed to have a game_goalies row. The scorekeeper finalization flow can mark a game complete without persisting goalie-of-record data, and game_goalies cannot reference placeholder users.

**Why:** Relying only on game_goalies made one recorded goalie appear correct while other goalies showed missing or incorrect games, goals against, results, and shutouts.

**How to apply:** For goalie stats, use existing game_goalies assignments when present, derive missing team/game assignments from approved roster goalies and confirmed attendance when available, calculate goals against from the completed game score, and represent placeholder goalies with their synthetic placeholder identity.