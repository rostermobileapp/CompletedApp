---
name: Prediction standings authority
description: Why raw team-summary counters are not authoritative inputs for game predictions.
---

Team-summary counters can remain zero even when the team has a substantial,
correctly scored season history. Prediction inputs must agree with canonical
result-derived league/season standings, including overtime/shootout losses;
do not assume those summary columns are maintained.

**Why:** A read-only audit confirmed that saved predictions reflected zero team
records and zero goals for/against while scored games produced nonzero standings.
Those values affect the model itself, not merely its record labels.

**How to apply:** Scope inputs to the target game's league and season, use the
same authoritative result eligibility as standings, preserve distinct displayed
OT/shootout losses, and deliberately adapt them to the supplied model's documented
half-credit convention. Keep the supplied formula unchanged unless the owner
separately approves tuning. Do not repair legitimate game history to match stale
summary counters.
