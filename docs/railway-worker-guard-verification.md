# Railway worker-guard release check

## Read-only evidence rechecked on 2026-10-26

| Field | Verified value | Source |
|---|---|---|
| Project | Roster — `0aff05ff-7f1e-4eb2-b383-13c3c8918137` | Railway project inventory |
| Environment | production — `aa52bb2b-6ecf-4b99-8df2-d5eb710a7249` | Live environment inventory |
| Service | CompletedApp — `56ba1c43-f2dd-477e-b1fc-310dbd841a45` | Live service inventory |
| Configured replicas | 1, region `us-east4-eqdc4a` | Environment inventory and service deploy configuration |
| Current successful deployment | `ae376c14-2d8e-417a-982c-295ff8ac68ca` | Service metadata |
| Application NODE_ENV | production | That deployment's runtime startup command |

Deployment-scoped log, **2026-10-26 00:08:30.527330527 UTC**:

```text
> NODE_ENV=production node dist/index.js
```

The environment contains one service and no separate worker service. There were
no staged Railway changes at inspection. No Railway mutation or release was made.

The service/environment IDs above are verified **Railway metadata**, not a claim
that the connector read those generated variables inside the running container.
Presence of a variable name alone is not evidence of its value.

## Pending source changes and production behavior

Railway's live source is GitHub repo `rostermobileapp/CompletedApp`, branch
`10_1_2026`, with deployed commit `adfd012b0e9b0faacd77ce785c74ea5cda5457fa`.
The Replit workspace branch currently has **7 commits ahead** of its
`origin/10_1_2026`. No push was made. Pushing that branch is not a one-commit
release; it would send all seven commits.

The pending server production-path files are:

- `server/runtimeBootstrap.ts` and `server/runtimePolicy.ts`: verify the
  runtime identity before application startup and emit a sanitized startup line.
- `server/index.ts` and `server/routes.ts`: guard existing startup initializers,
  provider construction, and job starters. With the verified production values,
  these guards pass and the existing calls still run.
- `server/resend.ts` and `server/oneSignalNotifications.ts`: guard direct
  email/push delivery calls; both pass through for verified production.
- `server/testDatabaseGuard.ts`: require verified production identity and then
  keep using the existing `DATABASE_URL`.
- `server/db.ts` and `server/supabaseStorage.ts`: import the early bootstrap.
- `server/databasePool.ts`: adds a development-only pool; verified production
  still uses the existing Neon pool.

`client/src/hooks/useNativelyNotifications.ts`,
`client/src/lib/firstRsvpTrigger.ts`, `client/src/lib/nativePurchases.ts`,
`client/src/lib/nonproductionSafety.ts`, and `client/src/main.tsx` contain
development-only client guards; a production Vite build does not activate them.
`server/vite.ts`'s changes are development-only. Test launchers, schemas, scripts,
and documentation are not app runtime changes.

Therefore, for the exact verified Railway identity, the **intended functional
production difference is the fail-fast identity check**, plus one sanitized
startup log line; the existing worker and provider paths pass their guards.
If a literal diff that touches only the startup-check files is required, the
current seven-commit branch does not satisfy that constraint. Do not release it
as if it were a one-file change.

## Delivery trigger

Railway reports a GitHub source and branch, but its read-only service
configuration does not expose whether Auto Deploy is enabled or the active
watch paths. The latest deployment's generic `reason=deploy` does not determine
whether it came from a GitHub push or a manual action.

Before release, open **Railway → Roster → CompletedApp → Settings** and inspect
the source/deploy settings for the connected branch, the Auto Deploy setting,
and any watch paths:

- If Auto Deploy is on, a GitHub push to `10_1_2026` that matches its watch
  paths can start a Railway build and deployment.
- If Auto Deploy is off, pushing changes source but does not start deployment;
  an explicit Railway Deploy/redeploy action starts it.

The actual trigger has not been verified. Do not push or use Railway's Deploy
action until the owner checks it and chooses the deployment time.

## Before approving the production release

In Railway, open **Roster → production → CompletedApp**:

1. Open the current successful deployment's logs, scoped to that deployment,
   and confirm the production start command above. Do not use service-wide logs
   from an older deployment as evidence for a new release.
2. In service settings, find scaling/replicas and confirm **one replica** in
   `us-east4-eqdc4a`; check the environment canvas for any separate worker services.
3. Check Variables for `NODE_ENV=production` and ensure development-isolation
   flags have not been added. The actual application command also sets NODE_ENV
   explicitly, as shown in the log.
4. Confirm generated `RAILWAY_ENVIRONMENT_ID` and `RAILWAY_SERVICE_ID` match the
   table. If the dashboard does not display their generated values, use an
   authenticated shell in the **current running Railway container**, not Replit
   and not a local `railway run` environment, to print only these non-secret IDs:

   ```sh
   node -e 'for (const k of ["RAILWAY_ENVIRONMENT_ID","RAILWAY_SERVICE_ID"]) console.log(`${k}=${process.env[k] ?? "<missing>"}`)'
   ```

   Do not dump the full environment or paste credentials. Resolve missing or
   different values before release; a failed startup is a last-resort safety
   measure, not a replacement for this preflight.

## No silent production disablement

Before application imports/startup work, the bootstrap validates production
configuration. `NODE_ENV=production` without the approved identity, an approved
production identity with a missing/development/test NODE_ENV, or development
isolation flags in that production context causes a visible
`PRODUCTION_RUNTIME_CONFIGURATION_INVALID` failure. It refuses startup before
opening the application port; it cannot become healthy with those worker gates
silently false.
The same refusal applies to an unexpected Railway identity even if NODE_ENV
is development/test. Other Railway preview/staging runtimes are not implicitly
approved by this policy; Replit's isolated development remains supported.

A verified production process emits one sanitized startup identity message:

```text
[Runtime policy] Production identity verified; worker startup permitted.
```

The message includes only NODE_ENV and the two Railway IDs. It proves policy
permission, **not** that a timer completed or that a delivery succeeded.
All four existing worker call sites remain gated by the same verified-production
predicate. Their schedules, job bodies, recipients, and delivery logic were not
changed by this safety patch.

## Owner's live checks after release

- **Reminders:** confirm the reminder/backup startup markers on the new
  deployment, then verify an eligible reminder through the normal application.
- **Badge queue:** verify a normal eligible beer-count change is queued and
  processed and produces the correct badge result. Quiet logs alone do not prove
  this worker stopped or ran.
- **Birthdays:** verify eligible birthday handling and persistent once-only
  behavior through the established check. This starter has no success log on
  every quiet cycle.
- **Trivia:** confirm `[TriviaPush] Automatic sender started`, then verify the
  noon America/New_York delivery and restart catch-up behavior without replaying
  already delivered trivia.

No test pushes, emails, purchases, birthdays, or trivia were triggered in
production during this investigation. The owner will perform the live checks.

Development schema came from repository definitions/migrations and nonpersonal
catalogs, with synthetic fixtures only; no production rows were copied.
Development was started only after worker/provider protection passed its tests.

Production measurement remains off. Its separate release and 24–48-hour window
must not be confused with this guard release or the later instrumentation-removal
release. No traffic-saving claim is made by these checks.
