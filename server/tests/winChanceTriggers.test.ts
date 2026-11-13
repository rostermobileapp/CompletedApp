import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const migration = readFileSync(
  resolve(process.cwd(), "migrations/0047_game_win_predictions.sql"),
  "utf8",
);
const dispatchScopeMigration = readFileSync(
  resolve(process.cwd(), "migrations/0049_win_chance_dispatch_scope.sql"),
  "utf8",
);
const routes = readFileSync(resolve(process.cwd(), "server/routes.ts"), "utf8");
const createTriggerStatements = [...migration.matchAll(/CREATE TRIGGER[\s\S]*?;/g)]
  .map(([statement]) => statement);

test("win-chance triggers are limited to the permitted data events", () => {
  const names = createTriggerStatements
    .map((statement) => statement.match(/CREATE TRIGGER\s+([a-z0-9_]+)/i)?.[1])
    .filter((name): name is string => Boolean(name))
    .sort();

  assert.deepEqual(names, [
    "win_chance_game_attendance_saved",
    "win_chance_game_final_score",
    "win_chance_game_goalies_saved",
    "win_chance_game_goals_deleted",
    "win_chance_game_goals_saved",
    "win_chance_game_goals_updated",
    "win_chance_player_stats_deleted",
    "win_chance_player_stats_inserted",
    "win_chance_player_stats_updated",
    "win_chance_team_record_saved",
  ].sort());
  assert.doesNotMatch(migration, /win_chance_rsvp_no|win_chance_tie_setting_saved/);

  const gameTriggerStatements = createTriggerStatements.filter((statement) =>
    /ON public\.games\b/i.test(statement),
  );
  assert.equal(gameTriggerStatements.length, 1);
  assert.match(
    gameTriggerStatements[0],
    /AFTER UPDATE OF home_score,\s*away_score,\s*is_completed ON public\.games/i,
  );
  assert.ok(createTriggerStatements.every((statement) => !/scheduled_at/i.test(statement)));
});

test("the scope migration removes RSVP and league-setting dispatches", () => {
  assert.match(dispatchScopeMigration, /DROP TRIGGER IF EXISTS win_chance_rsvp_no ON public\.game_rsvps/i);
  assert.match(dispatchScopeMigration, /DROP TRIGGER IF EXISTS win_chance_rsvp_no_updated ON public\.game_rsvps/i);
  assert.match(dispatchScopeMigration, /DROP TRIGGER IF EXISTS win_chance_tie_setting_saved ON public\.leagues/i);
});

test("the database enforces the per-team 30-second dispatch guard", () => {
  assert.match(
    migration,
    /last_dispatched_at\s*<=\s*clock_timestamp\(\)\s*-\s*interval '30 seconds'/i,
  );
});

test("prediction rows are team-readable and writable only by the service role", () => {
  assert.match(migration, /ALTER TABLE public\.game_predictions ENABLE ROW LEVEL SECURITY/i);
  assert.match(migration, /CREATE POLICY game_predictions_team_read[\s\S]*?tm\.team_id IN \(home_team_id, away_team_id\)/i);
  assert.match(migration, /lm\.assigned_team_id IN \(home_team_id, away_team_id\)/i);
  assert.match(migration, /REVOKE INSERT, UPDATE, DELETE ON public\.game_predictions FROM authenticated/i);
  assert.match(migration, /GRANT SELECT ON public\.game_predictions TO authenticated/i);
  assert.match(migration, /GRANT ALL ON public\.game_predictions TO service_role/i);
});

test("the authenticated prediction endpoint reads stored rows only", () => {
  const route = routes.match(
    /app\.get\('\/api\/games\/:gameId\/prediction'[\s\S]*?^  \}\);/m,
  )?.[0];
  assert.ok(route, "prediction route exists");
  assert.match(route, /isAuthenticated/);
  assert.match(route, /\.select\(/);
  assert.doesNotMatch(route, /\.(?:insert|update|delete)\(/i);
  assert.doesNotMatch(route, /dispatch_team|recalculate-win-chance/i);
});
