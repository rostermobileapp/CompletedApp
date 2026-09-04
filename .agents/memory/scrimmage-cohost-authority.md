---
name: Scrimmage co-host authority
description: Defines the baseline editing authority and granular operational permissions for scrimmage co-hosts.
---

A current scrimmage co-host has full access to the scrimmage details editor, including date, time, venue, capacity, cost, join mode, invitations, and other editable event settings.

**Why:** Co-hosts are intended to jointly operate the event and may need to finish incomplete details such as a TBD time rather than waiting for the creator.

**How to apply:** Authorize both creator and current co-host for the general scrimmage update route and expose edit entry points to both. Keep cancellation/deletion creator-only unless explicitly changed.

The granular co-host flags do not restrict general detail editing. They govern their named operational areas: approving/managing players, sending reminders, and managing payment statuses.

**Why:** Those flags were designed for sensitive follow-on actions, while co-host membership itself establishes shared ownership of event details.

**How to apply:** Use co-host membership for edit authorization; continue checking the specific flag on player, reminder, and payment mutation routes.