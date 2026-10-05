---
name: Badge tier sort order
description: PostgreSQL enum ordering must not be treated as badge progression order.
---

Assign numeric patch tiers using the explicit progression order, never the database enum's native sort order.

**Why:** The live PostgreSQL badge enum sorts Legend and God Mode before Diamond and Emerald. Values appended to an existing enum can preserve historical creation order rather than the intended achievement ranking, making an otherwise valid ordered query look like artwork is assigned incorrectly.

**How to apply:** Match tier names to the explicit category progression when assigning or verifying artwork. For ranked SQL results, supply an explicit rank expression rather than relying on native enum sorting. Do not renumber artwork or change the persisted enum just to match query order.
