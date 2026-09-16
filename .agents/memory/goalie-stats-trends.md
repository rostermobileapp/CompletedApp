---
name: Goalie stats trends
description: Product conventions for goalie-specific Player Stats & Trends views and GAA calculations.
---

Goalie-specific stats views should use the league's goalie assignment and recorded goalie game rows, not only the user's global profile type. The product's existing GAA convention is total goals against divided by games played; per-game GAA is the goals against recorded for that goalie game.

**Why:** The app's existing goalie leaderboard uses goals-against-per-game, and a player can have different skater/goalie roles across leagues.

**How to apply:** When extending player stats trends, preserve skater layouts for non-goalie league members and use Points, GP, GAA, and Beers for goalies.