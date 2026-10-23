---
name: Line-combo test data
description: Interpret test-labelled game lineups as synthetic, even when their scoring records are real.
---

Game-specific lineups marked `[TEST]` are synthetic arrangements for evaluating the combo tool, not verified historical lineups.

**Why:** The owner explicitly requested test lineups on prior completed games to compare combinations against real scorekeeper production. The scoring records remain real; the player groupings were constructed for the experiment.

**How to apply:** Keep the distinction clear when describing combo statistics or reviewing historical accuracy. These groupings intentionally participate in the existing combo calculation for testing; do not claim they establish actual on-ice combinations or silently remove/filter them without direction.

When backfilling a baseline from “current lines,” copy the same saved lineup to every requested game; do not introduce alternate arrangements.

**Why:** The owner corrected the initial varied backfill: “All dates should have current lines.” The intended experiment is for the owner to mix players afterward, not for the baseline history to contain invented variations.

**How to apply:** Preserve positions and player groupings exactly across the requested dates unless the owner explicitly supplies different historical lineups.

The line tool must estimate previously unseen combinations immediately while players are rearranged, without requiring Save.

**Why:** The owner explicitly corrected the exact-match-only behavior after swapping players: a recorded-average lookup is not the mathematical prediction they need.

**How to apply:** Distinguish recorded group averages from predictions and preserve unsaved preview behavior. Missing exact-group history must not suppress an estimate when the constituent players have usable scoring history.

Use a transparent additive player-PPG starting baseline. Learn conservative corrections prospectively from genuine forecasts and later verified results, not from fabricated historical variation.

**Why:** Identical historical groupings cannot establish how an unseen combination interacts. The owner subsequently clarified that future results must tune the formula itself, not merely update player averages or produce an accuracy report.

**How to apply:** Keep these synthetic groupings in the requested baseline calculation, but exclude them from calibration evidence. Never manufacture retrospective pre-game forecasts. Label estimates and learning sample sizes honestly; these are whole-game player-production estimates, not tracked on-ice chemistry.
