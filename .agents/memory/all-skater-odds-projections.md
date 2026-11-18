---
name: All-skater odds projections
description: Standing requirement for the full skater list at the bottom of game odds.
---

The game odds popup must show **all skaters** for the viewer's team and their
point predictions, not just the top three. Preserve zero-point projections and
players marked out; do not add goalies to the skater list.

**Why:** The owner reiterated that this was already agreed after a prediction
refresh replaced full lists with top-three output. Rendering the full saved array
does not help if the generator truncates that array before saving it.

**How to apply:** Check generation, stored JSON, API response, and popup mapping
as one contract. Keep the win-percentage formula unchanged when adjusting this
output. Treat an all-skater model-test failure as a relevant regression, not an
unrelated failure that can be set aside before publishing prediction changes.
