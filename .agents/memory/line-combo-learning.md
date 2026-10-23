---
name: Automatic line prediction tuning
description: Product requirement and evidence boundaries for adaptive line-combo predictions.
---

Future scored games must adjust the prediction formula, not just refresh player averages or report accuracy.

**Why:** The owner explicitly rejected accuracy tracking alone as insufficient: “It needs to tune the prediction formula.”

**How to apply:** Preserve an actual pre-game baseline and forecast, then use verified later outcomes to learn conservative corrections. Keep unsaved rearrangements predictive and keep observed averages visibly distinct. Corrected results should replace the same game's evidence, not create additional samples.

Do not describe player-pair production corrections as causal on-ice chemistry.

**Why:** Scorekeeper goals/assists measure named players' production across the game, not shifts played together. Planned team templates also need confirmed attendance before their results can be trusted.

**How to apply:** Require actual final game lineups or confirmed attendance for frozen template forecasts. Exclude test-labelled or changed lineups, incomplete scoring, and forecasts created after the start. Historical test groupings remain baseline data only; see line-combo-test-data.md.

Predictions must include the next opponent's goals scored and goals allowed per game, while recorded averages remain historical facts.

**Why:** The owner explicitly requested merging the next game's opponent and both scoring/conceding rates into the prediction formula.

**How to apply:** Use comparable league/season results, label the matchup influence, and remain neutral when no usable opponent history exists. Saved forecasts must use their own game's opponent, not whichever game is currently next. Learn against the frozen matchup-adjusted baseline; do not mix evidence from incompatible baseline formulas.
