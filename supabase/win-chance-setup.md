# Win-chance prediction setup

Predictions are calculated in a Supabase Edge Function. After migration 0050,
the database queues completed-game and other eligible input changes; the
application worker dispatches them synchronously to the function and acknowledges
them only after success. Older administrative SQL dispatches use `pg_net`.

## Configure each Supabase project

1. In Supabase Vault, create two secrets with these exact names:
   - `win_chance_project_url`: the project's Supabase URL.
   - `win_chance_secret_key`: the project's **default API secret key**.
2. Apply `migrations/0047_game_win_predictions.sql`,
   `migrations/0048_win_chance_safe_save.sql`, and
   `migrations/0049_win_chance_dispatch_scope.sql`.
3. Deploy `recalculate-win-chance` from `supabase/functions`, including
   `handler.ts`, `calculator.ts`, `modelInputs.ts`, `gameTime.ts`, and the unchanged model.

The migration enables `pg_net`, adds the prediction table and RLS policy, and
registers the restricted triggers. The default API secret is read only from
Vault and is never stored in this repository.

## Seed existing upcoming games

After the function is deployed and the migration is applied, run the following
once in the Supabase SQL editor to create predictions for already-scheduled
games. It uses the same per-team 30-second dispatch guard as the triggers:

```sql
SELECT public.win_chance_dispatch_team(id)
FROM public.teams
WHERE league_id IS NOT NULL;
```

For a one-team smoke test, run `SELECT public.win_chance_dispatch_team('<team-id>');`
in the SQL editor and then read that team's upcoming `game_predictions` rows.

Schedule changes, RSVP changes, league tie-setting changes, reads, and page
opens do not invoke the worker. Automatic updates follow completed-game
score/result changes, scorekeeper attendance/goals/goalie inputs for completed
games, player-stat changes, and team record changes. If a later schedule needs
an initial prediction before an eligible data event occurs, run the one-team
SQL dispatch above as an explicit administrative seed.

Migration 0048 must be applied **before** deploying the corrected worker: its
service-role-only save function locks the game row and rejects started, scored,
completed, reassigned, and older calculations. It does not alter game scores,
team records, or existing forecasts. After deployment, use the administrative
dispatch once for affected teams to replace upcoming forecasts built with stale
summary inputs. Do not seed before replacing the old worker.

The input sources and missing-data rules are documented in
`supabase/win-chance-inputs.md`.

## Application queue authentication

The application recalculation worker reads `win_chance_project_url` and
`win_chance_secret_key` from the same project's Vault through its server-only
database connection. That database role must have permission to read
`vault.decrypted_secrets`. The URL must match the server's `SUPABASE_URL`, and
the key must be a modern `sb_secret_...` API secret accepted by the Edge
Function's `auth: "secret"` protection. No extra Railway secret is needed.
Do not substitute the legacy `SUPABASE_SERVICE_ROLE_KEY` JWT or weaken Edge
Function authentication to make a dispatch pass.

Queue jobs are acknowledged only after the synchronous Edge Function response
confirms `{ "ok": true }`. HTTP errors, timeouts, malformed responses, and missing
Vault configuration retain the job for retry. Credentials and remote error
bodies must never be logged. Publishing the server fix and replaying previously
failed live jobs are separate operational steps; tests must not dispatch against
live games.

## Publish and verify both runtimes

Railway and Supabase publish independently. A successful Railway publish does
**not** update the Edge Function. Its request contract must accept all four
targets: `team_id`, `game_id`, `source_game_id`, and `source_game_ids`.

1. With approval, publish `supabase/functions/recalculate-win-chance` to the
   matching Supabase project. Keep `verify_jwt = false` in function config:
   authentication is still enforced by `withSupabase({ auth: "secret" })`, not
   disabled. Use the CLI remote bundler (`--use-api`) if local bundling fails.
2. Publish the corresponding application changes to Railway.
3. Run the read-only contract check:

   ```sh
   npx tsx scripts/verify-win-chance-deployment.ts --production-read-only
   ```

   It checks that the database, Vault URL, and Supabase project match, then calls
   the authenticated `GET ?contract=1` route. Only after the expected contract
   is confirmed does it validate all four POST shapes using `validate_only: true`.
   No calculators run and no predictions or queue jobs are changed. An old
   deployment fails before any POST is sent.
4. Obtain separate approval before replaying failed live jobs. Publishing alone
   does not override a queue job's deferred retry time. Automatically due jobs
   can still run normally after either deployment.

Completed-game badge candidates must exist in `users` with no `deleted_at`.
Orphaned historical goal/assist/attendance/penalty records are preserved, but
must not produce foreign-key errors while awarding badges.

## Isolated input integration checks

Run against a disposable local PostgreSQL database named `win_chance_test`:

```sh
WIN_CHANCE_TEST_DB_URL=postgresql://TEST_ROLE@127.0.0.1:TEST_PORT/win_chance_test \
  npx tsx --test server/tests/winChanceInputs.test.ts server/tests/winProbability.test.ts
```

The tests reject non-local hosts and other database names, recreate the test
schemas, and use the real prediction-table schema, read policy, and guarded-write
migration. Never point this command at application data.

## Internal formula-accuracy report

The report is a development-only, read-only command; it does not add a
commissioner-facing accuracy page or modify stored predictions. After the
isolated development Supabase project is reachable and migration 0047 has been
applied, run:

```sh
npm run win-chance:accuracy
```

It evaluates only completed non-scrimmage games with a stored prediction whose
team IDs still match the game. It reports sample counts, top-choice accuracy,
mean multiclass Brier score, and per-outcome probability calibration buckets
overall and by league. Samples under 30 games are explicitly flagged. Tied final
scores are counted as ties only when that league allows ties; inconsistent tied
results for no-tie leagues are excluded.
