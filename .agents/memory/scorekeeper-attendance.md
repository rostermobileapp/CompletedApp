---
name: Scorekeeper attendance
description: Attendance is an independent participation signal for completed-game stats.
---

Scorekeeper-confirmed attendance is separate from RSVP and player scoring events. It may create a zero-point game entry, count toward GP, and participate in streak recency; RSVP alone never does.

**Why:** A player can participate without responding to an RSVP or recording a point, and reopening a completed game must preserve an intentional empty attendance selection.

**How to apply:** Keep attendance idempotent per game/player, union it with scoring participation without duplicate games, and support registered and placeholder identities.