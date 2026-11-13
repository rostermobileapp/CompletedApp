# Verified game-summary read rollout

The summary cache covers league standings, team hot/cold streaks, and the full
Trophy Case response. It stores the existing raw-read output; it does not change
scoring, award eligibility, response authorization, or source records.

## Safe rollout

1. Apply `migrations/0052_verified_game_summaries.sql` only to an approved
   non-production database first. The migration creates empty cache and
   revision tables plus invalidation triggers; it performs no backfill.
2. Leave `GAME_SUMMARY_READ_MODE` unset or set it to `off` while deploying. This
   is the default and keeps all three screens on their current raw calculations.
3. Set the mode to `verify` in the isolated environment. A requested scope is
   lazily populated from its raw calculation. Later requests recompute the raw
   result and compare it with the stored payload; the raw result remains the
   response. Two matching comparisons at the same source revision are required
   before that scope is marked verified.
4. Review `game_summary_parity_reports` for mismatches and
   `verified_game_summary_cache` for verified scopes. Investigate any mismatch
   before switching modes. Reports contain hashes and row counts, not response
   payloads.
5. Set `GAME_SUMMARY_READ_MODE=summary` only after the reviewed scopes are
   verified. A cache is used only when its source revision and payload version
   still match. A cold, stale, or unverified scope falls back to the raw
   calculation and refreshes its cache.
6. Re-run verification after changing source calculations; increment
   `GAME_SUMMARY_CACHE_VERSION` whenever the cached response shape or semantics
   change.

Game, roster, attendance, score, badge, season, and scrimmage corrections bump
the relevant league, team, or player revision. This invalidates only the
affected summaries; they refresh on the next request. To roll back reads,
restore `GAME_SUMMARY_READ_MODE=off`. Source data is never modified by the
summary reader.

No production migration, backfill, environment change, or deployment was
performed for this work.
