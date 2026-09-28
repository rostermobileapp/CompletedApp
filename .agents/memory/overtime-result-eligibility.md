---
name: Overtime result eligibility
description: Why a close hockey score cannot automatically determine the result type
---

Mark overtime only when the scorekeeper explicitly selects it and the final scores differ by exactly one goal. A one-goal margin alone should remain regulation by default.

**Why:** Regulation games can also end one goal apart; inferring overtime from the score would misclassify standings points.

**How to apply:** Any score-entry flow or import that sets a game result type should validate the one-goal margin before saving overtime, without automatically converting every close game to overtime.