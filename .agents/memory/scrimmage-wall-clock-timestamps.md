---
name: Scrimmage wall-clock timestamps
description: Why scrimmage date/time values must remain league-local strings from database write through client display.
---

Scrimmage times are wall-clock values in the league timezone. Never pass a JavaScript `Date` to a scrimmage `date_time` database write; format it back to a league-local datetime string first. Client scrimmage views must likewise parse the stored components as a wall-clock value rather than letting the browser reinterpret a trailing `Z`.

**Why:** The column is PostgreSQL `timestamp without time zone`. A recurring 9:00 PM Eastern time converted to a `Date` was serialized as 1:00 AM UTC, so different users saw the wrong clock time.

**How to apply:** Use timezone-aware `Date` objects only for comparisons and recurrence arithmetic. At storage and display boundaries, preserve the original league-local date and clock components.