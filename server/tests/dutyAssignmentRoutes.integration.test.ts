import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { getTableConfig } from "drizzle-orm/pg-core";
import {
  dutyAssignments, games, substituteRequests, teamEvents,
  tournamentMatches, tournamentParticipants, tournamentTeams, users,
} from "../../shared/schema";
import { createDutyAssignmentDependencies } from "../dutyAssignmentRoutes";

// Deliberately isolated: never consult DATABASE_URL or inherited PG* variables.
// Run against a disposable local PostgreSQL fixture on this dedicated port.
const pool = new Pool({
  host: "127.0.0.1", port: 55459, database: "duty_assignment_test",
  user: "runner", password: "", connectionTimeoutMillis: 2000,
});
const database = drizzle(pool);
const dependencies = createDutyAssignmentDependencies(database as any, {
  getTeam: async (id: string) => id === "team" ? { id } as any : undefined,
  isTeamCaptain: async (_id: string, actor: string) => actor === "captain",
  getTeamMembers: async () => [{ userId: "player", user: { firstName: "Roster", lastName: "Player" } }] as any,
  getDutyTemplatesForGame: async () => [{ id: "duty" }] as any,
  releaseDuty: async (dutyId, gameId, teamId) => {
    await pool.query("DELETE FROM duty_assignments WHERE duty_template_id=$1 AND game_id=$2 AND team_id=$3",
      [dutyId, gameId, teamId]);
  },
});

before(async () => {
  for (const table of [dutyAssignments, games, substituteRequests, teamEvents,
    tournamentMatches, tournamentParticipants, tournamentTeams, users]) {
    const config = getTableConfig(table);
    // Matching column names/types, without unrelated foreign keys or required fields.
    const columns = config.columns.map(column => {
      const type = column.enumValues?.length ? "text" :
        (column as any).baseColumn?.enumValues?.length ? "text[]" : column.getSQLType();
      const defaults = column.name === "id" ? " DEFAULT gen_random_uuid()" :
        column.name === "claimed_at" ? " DEFAULT now()" : "";
      return `"${column.name}" ${type}${defaults}`;
    });
    await pool.query(`DROP TABLE IF EXISTS "${config.name}"`);
    await pool.query(`CREATE TABLE "${config.name}" (${columns.join(",")})`);
  }
  await pool.query("CREATE UNIQUE INDEX ON duty_assignments(duty_template_id,game_id,team_id)");
  await pool.query(`INSERT INTO games(id,home_team_id,away_team_id) VALUES ('game','team','opponent')`);
  await pool.query(`INSERT INTO team_events(id,team_id) VALUES ('event','team'),('foreign-event','opponent')`);
  await pool.query(`INSERT INTO tournament_teams(id,team_id) VALUES ('entry','team'),('opponent-entry','opponent')`);
  await pool.query(`INSERT INTO tournament_matches(id,game_id,team1_id,team2_id)
    VALUES ('match','tournament-game','entry','opponent-entry')`);
  await pool.query(`INSERT INTO users(id,first_name,last_name) VALUES
    ('sub','Approved','Sub'),('pending','Pending','Sub'),('wrong-team','Other','Sub'),
    ('participant','Tournament','Player'),('opponent','Opponent','Player')`);
  await pool.query(`INSERT INTO substitute_requests(game_id,substitute_player_id,requesting_team_id,status)
    VALUES ('game','sub','team','approved'),('game','pending','team','pending_opponent_approval'),
      ('game','wrong-team','opponent','approved')`);
  await pool.query(`INSERT INTO tournament_participants(tournament_team_id,user_id,status)
    VALUES ('entry','participant','approved'),('opponent-entry','opponent','approved')`);
});
after(async () => { await pool.end(); });

test("regular games and team scrimmages resolve only for their own team", async () => {
  assert.equal((await dependencies.resolveContext("game", "team")).substituteGameId, "game");
  assert.equal((await dependencies.resolveContext("event", "team")).teamEventId, "event");
  await assert.rejects(dependencies.resolveContext("foreign-event", "team"), /does not belong/);
  await assert.rejects(dependencies.resolveContext("missing", "team"), /not found/);
});
test("tournament match and linked game IDs resolve regular and tournament team IDs consistently", async () => {
  for (const gameId of ["match", "tournament-game"]) {
    for (const teamId of ["team", "entry"]) {
      const context = await dependencies.resolveContext(gameId, teamId);
      assert.equal(context.teamId, "team");
      assert.deepEqual(context.tournamentTeamIds, ["entry"]);
      assert.equal(context.substituteGameId, "tournament-game");
    }
  }
  await assert.rejects(dependencies.resolveContext("game", "entry"), /not playing/);
});
test("picker includes roster and approved same-game substitutes, never pending or opposing substitutes", async () => {
  const context = await dependencies.resolveContext("game", "team");
  const players = await dependencies.getPlayers(context);
  assert.deepEqual(players.map(player => player.userId).sort(), ["player", "sub"]);
});
test("tournament picker includes only this side's approved participants", async () => {
  const context = await dependencies.resolveContext("match", "entry");
  assert.deepEqual((await dependencies.getPlayers(context)).map(player => player.userId).sort(),
    ["participant", "player"]);
});
test("upsert reassigns atomically, persists one row, and clear preserves other games", async () => {
  const context = await dependencies.resolveContext("game", "team");
  await dependencies.save({ ...context, gameId: "other-game" }, "duty", "player");
  await dependencies.save(context, "duty", "player");
  await Promise.all(["player", "sub", "player"].map(userId => dependencies.save(context, "duty", userId)));
  const { rows } = await pool.query("SELECT * FROM duty_assignments WHERE game_id='game'");
  assert.equal(rows.length, 1);
  await dependencies.save(context, "duty", "sub");
  assert.equal((await pool.query("SELECT user_id FROM duty_assignments WHERE game_id='game'")).rows[0].user_id, "sub");
  await dependencies.save(context, "duty", null);
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM duty_assignments WHERE game_id='game'")).rows[0].n, 0);
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM duty_assignments WHERE game_id='other-game'")).rows[0].n, 1);
});
