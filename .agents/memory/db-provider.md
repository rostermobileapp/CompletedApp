---
name: Database provider
description: The PostgreSQL database is hosted on Supabase, not Neon.
---

The project uses Supabase for PostgreSQL hosting. The `DATABASE_URL` environment variable points to a Supabase connection string.

**Why:** replit.md previously said "Neon Database" but the user confirmed this was wrong — it is Supabase.

**How to apply:** When querying the DB directly (e.g. via executeSql in code_execution), it connects to Supabase. Do not reference Neon in documentation or troubleshooting notes.
