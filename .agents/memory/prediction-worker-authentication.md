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

An authenticated method-guard response proves authentication only, not that the
deployed function supports the caller's request targets. Verify the deployed
function contract separately before declaring a dispatch fix ready.

**Why:** Railway and Supabase publish independently. An authenticated older
function accepted team requests but rejected the newer completed-game source
targets with HTTP 400, leaving predictions stale even after the server fix.

**How to apply:** Compare the deployed function's accepted targets with every
server dispatch path. Do not say a Railway-only publish is sufficient without
checking that contract. Include a non-mutating validation check for the request
shape, not just a GET authentication probe.
