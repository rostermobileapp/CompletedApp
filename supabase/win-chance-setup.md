# Win-chance prediction setup

The prediction worker runs as a Supabase Edge Function. The database queues
requests with `pg_net`; requests do not run in the application process.

## Configure each Supabase project

1. In Supabase Vault, create two secrets with these exact names:
   - `win_chance_project_url`: the project's Supabase URL.
   - `win_chance_secret_key`: the project's **default API secret key**.
2. Deploy `recalculate-win-chance` from `supabase/functions`.
3. Apply `migrations/0047_game_win_predictions.sql`.

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

Schedule changes do not invoke the worker. After the initial seed, automatic
updates are limited to completed-game scores, scorekeeper attendance,
goals/goalie/player stats, team records, a league tie-setting change, and an RSVP
becoming “No.” Reads and page opens never invoke the worker. If a later schedule
needs an initial prediction before any eligible data event occurs, run the
one-team SQL dispatch above as an explicit administrative seed.

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
