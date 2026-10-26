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
   node -e 'console.log(JSON.stringify({RAILWAY_ENVIRONMENT_ID:process.env.RAILWAY_ENVIRONMENT_ID,RAILWAY_SERVICE_ID:process.env.RAILWAY_SERVICE_ID},null,2))'
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
