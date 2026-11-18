import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { transformSync } from "esbuild";
import ts from "typescript";
import pg from "pg";

// Fixed loopback fixture only: never read application database credentials.
const config = { host: "127.0.0.1", port: 55442, user: "award_test", password: "", ssl: false, max: 2 };
const source = ts.createSourceFile(
  "worker.ts", readFileSync("server/scorekeeperRecalculation.ts", "utf8"), ts.ScriptTarget.Latest, true,
);
const node = source.statements.find(statement =>
  ts.isFunctionDeclaration(statement) && statement.name?.text === "gameBadgeEvaluations");
assert.ok(node);
const compiled = transformSync(`${node.getText(source)}; gameBadgeEvaluations`, { loader: "ts" }).code;

test("completed-game badge candidates exclude missing and retired users without changing history", async (t) => {
  const admin = new pg.Pool({ ...config, database: "postgres" });
  const database = `scorekeeper_participants_${process.pid}`;
  let pool: pg.Pool | undefined;
  try {
    await admin.query(`CREATE DATABASE "${database}"`);
    pool = new pg.Pool({ ...config, database });
    await pool.query(`
      CREATE TABLE users(id text PRIMARY KEY, deleted_at timestamp);
      CREATE TABLE game_attendance(game_id text,user_id text);
      CREATE TABLE game_goalies(game_id text,goalie_user_id text);
      CREATE TABLE game_goals(game_id text,scorer_id text,primary_assist_id text,secondary_assist_id text);
      CREATE TABLE game_penalties(game_id text,player_id text);
      CREATE TABLE badge_progress(user_id text REFERENCES users(id),progress integer);
      INSERT INTO users VALUES
        ('roster',NULL),('attendee',NULL),('goalie',NULL),('scorer',NULL),
        ('assist-1',NULL),('assist-2',NULL),('penalty',NULL),('retired',NOW());
      INSERT INTO game_attendance VALUES ('game','attendee'),('game','missing-attendee'),('game','retired'),
        ('all-deleted','missing-attendee');
      INSERT INTO game_goalies VALUES ('game','goalie'),('game','missing-goalie');
      INSERT INTO game_goals VALUES ('game','scorer','assist-1','assist-2'),
        ('game','missing-scorer','missing-assist',NULL);
      INSERT INTO game_penalties VALUES ('game','penalty'),('game','missing-penalty');
    `);
    let roster = ["roster", "missing-roster", "retired", "roster"];
    let foundGame = true;
    const load = runInNewContext(compiled, {
      eq: () => true, games: { id: "id" },
      storage: { getTeamMembers: async () => roster.map(userId => ({ userId })) },
      pool,
      db: { select: () => {
        const query = {
          from: () => query, where: () => query,
          limit: async () => foundGame ? [{
            isCompleted: true, scheduledAt: "2026-11-15", homeTeamId: "home", awayTeamId: "away",
            leagueId: "league", seasonId: "season",
          }] : [],
        };
        return query;
      } },
    });

    await t.test("all active historical identities and current roster are retained and deduplicated", async () => {
      const result = await load("game");
      const ids = [...result.evaluations.map((entry: any) => entry.userId)].sort();
      assert.deepEqual(ids, ["assist-1", "assist-2", "attendee", "goalie", "penalty", "roster", "scorer"]);
      for (const evaluation of result.evaluations) {
        assert.equal(evaluation.context.year, 2026);
        await pool!.query("INSERT INTO badge_progress VALUES($1,1)", [evaluation.userId]);
      }
      assert.equal((await pool!.query("SELECT count(*)::int AS count FROM badge_progress")).rows[0].count, 7);
      assert.equal((await pool!.query("SELECT count(*)::int AS count FROM game_attendance")).rows[0].count, 4);
      assert.equal((await pool!.query("SELECT count(*)::int AS count FROM game_goals")).rows[0].count, 2);
    });
    await t.test("a game containing only deleted identities has no award candidates", async () => {
      roster = ["retired", "missing-roster"];
      assert.equal((await load("all-deleted")).evaluations.length, 0);
    });
    await t.test("empty rosters and no recorded participants are safe", async () => {
      roster = [];
      assert.equal((await load("empty")).evaluations.length, 0);
    });
    await t.test("a removed game needs no participant query", async () => {
      foundGame = false;
      const result = await load("removed");
      assert.equal(result.game, null);
      assert.equal(result.evaluations.length, 0);
    });
  } finally {
    await pool?.end();
    await admin.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
    await admin.end();
  }
});
