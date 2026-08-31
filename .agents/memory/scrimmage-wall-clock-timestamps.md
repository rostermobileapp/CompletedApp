---
name: Scrimmage wall-clock timestamps
description: Why scrimmage date/time values must remain league-local strings from database write through client display.
---

Scrimmage times and payment deadlines are wall-clock values in the league timezone. Never pass a JavaScript `Date` to a scrimmage `date_time` or date-only payment deadline write; use Drizzle string mode and preserve the league-local components. Client scrimmage views must likewise parse stored components as a wall-clock value rather than letting the browser reinterpret a trailing `Z`.

**Why:** These columns are PostgreSQL `timestamp without time zone`. A recurring 9:00 PM Eastern time converted to a `Date` was serialized as 1:00 AM UTC, so different users saw the wrong clock time; Drizzle's default timestamp mode also calls `toISOString()`, which crashes when a date-only form string is passed.

**How to apply:** Use timezone-aware `Date` objects only for comparisons and recurrence arithmetic. At storage and display boundaries, preserve the original league-local date and clock components, and declare date-only timestamp columns with `{ mode: 'string' }`.