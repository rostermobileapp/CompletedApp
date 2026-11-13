# Prediction input contract

The supplied `winProbability.ts` is unchanged. Input preparation—not model
weights—adapts the application's data to that formula.

| Input | Source and scope | Ordering / missing-data rule |
| --- | --- | --- |
| Games played, W/L/T/OTL, goals for/against | Scored, non-scrimmage games in the target game's explicit season; both opponents must belong to that league/season, matching standings eligibility | Never read `teams` summary counters; no scores from future local dates; paginate all history |
| Overtime/shootout losses | Final scores and `result_type` | Store/display separately as `shootoutLosses`; pass ties + OTL into the model's documented half-credit input, with games counted once |
| Streak | Same eligible team games | Newest first; a tie or opposite result ends the run; OT/SO losses are losses for streaks |
| Roster | Approved team memberships and approved league assignments; assigned placeholders | Explicit reassignment takes precedence over stale direct membership; a null league assignment may retain approved direct membership |
| Player season goals, assists and GP | Exact league/season `player_stats`, supplemented by eligible team attendance/submitted scoring events | Use the greater available season total or recorded game-history total; never pull another season's stats; recorded zero-point attendance counts |
| Player recent form | Confirmed attendance plus submitted goals/assists in eligible team games | Newest four played games; do not fabricate zero-point games for absent players |
| Placeholder identity | `placeholder:{id}` for roster/attendance; normalize explicitly recorded goal identities | No name/email guessing; absent scoring history is not invented; attendance is retained even without a `player_stats` row |
| RSVP | Target game + team + roster user | `attending` → in, `not_attending` → out, absent response → none; synthetic placeholders have no user RSVP |
| No-response attendance rate | Player GP relative to the same team's GP | Handled by the supplied model; an unknown GP=0 uses its existing prior/clamp rather than asserting attendance |
| Goalie GP and goals against | Recorded goalie assignment; otherwise a unique attending goalie or sole roster goalie | Final opponent score is authoritative, not a default-zero goalie row; ambiguous assignments remain unavailable and use the model's team prior |
| Goalie recent form | Same eligible goalie-assigned games | Newest five; unknown personal history has GP=0 and uses the corrected team prior |
| League scoring average | Same eligible league/season results | Total goals / twice the number of games; no available positive baseline uses the supplied model's fallback |
| Head-to-head | Same scoped history, restricted to the two teams | Newest first, normalized to the home prediction team's perspective |
| Tie probability | League `allow_ties` | Passed unchanged to the supplied model |
| Future/played boundary | League timezone and league-local `scheduled_at` | Revalidate before saving; the database locks the game and checks eligibility again atomically |

## Write and read boundaries

- HTTP entry point still requires Supabase secret authentication.
- Ordinary clients cannot execute the guarded save function.
- Prediction reads keep the existing authenticated team-member/captain policy.
- Only the existing restricted events dispatch updates. Correcting a completed
  OT/SO classification is a completed-result edit; schedule changes, reads,
  refreshes, modal openings, and polling do not trigger calculation.
- A late worker cannot overwrite a newer calculation or a completed game's
  historical forecast.

## Audit example

A read-only audit of Mavericks versus Neon Green on 2026-11-12 found zero team
summary counters despite result-derived records of 8-0-0-1 and 1-7-1-0, with
64/39 and 32/57 goals for/against. A dry run using the corrected loader and
unchanged model produced 95% / 5%, expected goals about 8.31 / 3.52, and an
8-3 projected score. These are observed outputs, not constants or test targets
for live data; they can change with results and availability.
