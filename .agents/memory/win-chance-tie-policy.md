---
name: Win-chance tie policy
description: The tie probability in game predictions follows each league's tie setting.
---

Prediction tie handling must use the current league's configured `allow_ties` setting; do not impose a global tie policy.

**Why:** The owner confirmed that win-chance predictions should follow each league's setting and approved adding the setting when one did not already exist.

**How to apply:** Read the league's setting when generating predictions. Preserve the per-league choice in future prediction changes and UI.
