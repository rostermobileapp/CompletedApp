---
name: Prediction worker authentication
description: Why prediction dispatch must use the existing modern Vault API secret rather than the server's legacy service-role JWT.
---

Keep prediction dispatch on the existing modern API-secret authentication and
reuse the project's Vault configuration instead of copying another credential
into Railway or relaxing the Edge Function's protection.

**Why:** The server's legacy service-role JWT worked for database administration
but received `401 INVALID_API_KEY` from the prediction Edge Function's secret
authentication. A non-mutating GET with the existing modern Vault secret reached
the authenticated method guard (`405`). Production database access to Vault and
the configured project match were also verified without changing data.

**How to apply:** Distinguish database-admin credentials from function API-secret
credentials. Validate the destination before sending a key, never log credential
values or remote error bodies, and require confirmed synchronous completion
before acknowledging recalculation jobs. Test authentication with a non-mutating
request; publishing and replaying live jobs require their own approval.
