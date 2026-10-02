---
name: Tool clock compatibility
description: Real-time expiry checks when the operational JavaScript sandbox rejects its documented clock APIs.
---

Do not assume the operational sandbox's durable JavaScript scope supports real-time clock reads. If it reports that the clock is disabled, obtain the current timestamp inside a minimal impure function and pass that timestamp back to the verification logic.

**Why:** A live purchase verification encountered a sandbox version that rejected `Date.now()` despite the tool's advertised support. The failure occurred before the repair, so retrying without checking which steps ran could have confused the operation's state.

**How to apply:** Use this only for operational tool scripts when that runtime error occurs, not application code. Check whether any preceding writes executed before retrying; preserve independently verified expiry and ownership requirements.