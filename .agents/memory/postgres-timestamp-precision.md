---
name: PostgreSQL timestamp round-trip precision
description: Strict timestamp comparisons can fail after a PostgreSQL value passes through JavaScript Date.
---

Preserve PostgreSQL timestamp precision when round-tripping values used in strict equality checks.

**Why:** PostgreSQL preserves microseconds, while JavaScript Date preserves only milliseconds. A correct future-game forecast was silently skipped because its round-tripped start time no longer exactly equaled the original database timestamp.

**How to apply:** Carry canonical timestamp text or compare within PostgreSQL when exact identity matters. Do not assume a timestamp returned as Date can be rebound and compared with equality to the original value. Test with database-generated microsecond timestamps, not only application-generated millisecond dates.
