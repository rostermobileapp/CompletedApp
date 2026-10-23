// Hard-coded loopback connection only. Never reads DATABASE_URL or workspace PG defaults.
import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { PgDialect } from "drizzle-orm/pg-core";
import { ensureLineComboLearningDatabase } from "../lineComboLearningDb";
import { captureUpcomingLineForecasts, evaluateLineForecastsSql, loadLineComboCalibration } from "../lineComboLearning";
import { buildLineComboStats, projectLineCombo, type ComboHistoryRow } from "../../shared/lineComboPredictions";
import { lineComboHistoryQuery } from "../lineComboPredictions";
import { loadLineComboOpponent } from "../lineComboOpponent";
import { learnLineComboCalibration } from "../../shared/lineComboLearning";

test("future forecast capture, outcome validation and automatic recalibration", { timeout: 30000 }, async t => {
  const config = { host: "127.0.0.1", port: 55442, user: "award_test", password: "", ssl: false, max: 3 };
  const admin = new pg.Pool({ ...config, database: "postgres" });
  const database = `line_combo_learning_${process.pid}`;
  let pool: pg.Pool | undefined;
  try {
    await admin.query(`CREATE DATABASE "${database}"`);
    pool = new pg.Pool({ ...config, database });
    await pool.query(`
      CREATE TYPE line_type AS ENUM('forward','defense');
      CREATE TABLE leagues(id varchar PRIMARY KEY,timezone text);
      CREATE TABLE teams(id varchar PRIMARY KEY,name text);
      CREATE TABLE games(id varchar PRIMARY KEY,league_id varchar,home_team_id varchar,away_team_id varchar,
        scheduled_at timestamp,is_completed boolean,home_score integer,away_score integer,
        season_id varchar,is_scrimmage boolean DEFAULT false,opponent_name text);
      CREATE TABLE line_combinations(id varchar PRIMARY KEY,team_id varchar,game_id varchar,name text,
        line_type line_type,line_number integer,is_active boolean DEFAULT true);
      CREATE TABLE line_combination_assignments(id serial PRIMARY KEY,line_combination_id varchar,player_id varchar,position text);
      CREATE TABLE game_goals(id serial PRIMARY KEY,game_id varchar,team_id varchar,scorer_id varchar,
        primary_assist_id varchar,secondary_assist_id varchar,is_submitted boolean DEFAULT true);
      CREATE TABLE game_attendance(game_id varchar,team_id varchar,user_id varchar);
      INSERT INTO leagues VALUES('league','America/New_York');
      INSERT INTO teams VALUES('team','Team'),('opponent','Opponent');
      INSERT INTO games SELECT 'old'||i,'league','team','opponent',
        timezone('America/New_York',clock_timestamp()-interval '7 days'),true,4,0 FROM generate_series(1,6)i;
      INSERT INTO games VALUES('future','league','team','opponent',
        timezone('America/New_York',clock_timestamp()+interval '1 hour'),false,NULL,NULL);
      INSERT INTO line_combinations VALUES
        ('template1','team',NULL,'Line 1','forward',1,true),('template2','team',NULL,'Line 2','forward',2,true);
      INSERT INTO line_combinations SELECT 'old'||i||'-'||j,'team','old'||i,'[TEST] Line '||j,'forward',j,true
        FROM generate_series(1,6)i CROSS JOIN generate_series(1,2)j;
      INSERT INTO line_combination_assignments(line_combination_id,player_id,position)
        SELECT lc.id,p.id,p.position FROM line_combinations lc CROSS JOIN
          (VALUES(1,'a','LW'),(1,'b','C'),(1,'c','RW'),(2,'d','LW'),(2,'e','C'),(2,'f','RW'))p(line,id,position)
        WHERE lc.line_number=p.line;
      INSERT INTO game_goals(game_id,team_id,scorer_id,primary_assist_id)
        SELECT g.id,'team',p.scorer,p.assist FROM games g CROSS JOIN
          (VALUES('a','b'),('b','a'),('d','a'),('d','a'))p(scorer,assist) WHERE g.is_completed=true;
    `);
    await ensureLineComboLearningDatabase(pool);
    await ensureLineComboLearningDatabase(pool);
    const capture = async () => {
      const client = await pool!.connect();
      try { await captureUpcomingLineForecasts(client); } finally { client.release(); }
    };
    const evaluate = () => pool!.query(evaluateLineForecastsSql, ["team"]);
    const first = async () => (await pool!.query("SELECT * FROM line_combo_forecasts WHERE line_number=1")).rows[0];
    await t.test("automatic setup is idempotent and private", async () => {
      assert.equal((await pool!.query("SELECT relrowsecurity FROM pg_class WHERE relname='line_combo_forecasts'")).rows[0].relrowsecurity, true);
    });
    await t.test("only future games get forecasts; synthetic old games cannot seed learning", async () => {
      await capture(); await capture();
      const forecasts = (await pool!.query("SELECT * FROM line_combo_forecasts ORDER BY line_number")).rows;
      assert.equal(forecasts.length, 2);
      assert.equal(forecasts[0].game_id, "future");
      const opponent = await loadLineComboOpponent(pool!, "team");
      assert.equal(forecasts[0].base_ppg, 6 * opponent.multiplier);
      assert.ok(forecasts.every(f => f.captured_at < f.starts_at));
      assert.equal((await loadLineComboCalibration(pool!, "team")).evaluatedGames, 0);
    });
    await t.test("saved player changes update the pending forecast, not duplicate it", async () => {
      await pool!.query("UPDATE line_combination_assignments SET player_id=CASE player_id WHEN 'a' THEN 'd' ELSE 'a' END WHERE line_combination_id IN('template1','template2') AND player_id IN('a','d')");
      await capture();
      assert.deepEqual((await first()).player_ids, ["b", "c", "d"]);
      assert.equal((await first()).base_ppg, 4 * (await loadLineComboOpponent(pool!, "team")).multiplier);
      await pool!.query("UPDATE line_combination_assignments SET player_id=CASE player_id WHEN 'a' THEN 'd' ELSE 'a' END WHERE line_combination_id IN('template1','template2') AND player_id IN('a','d')");
      await capture();
      assert.deepEqual((await first()).player_ids, ["a", "b", "c"]);
    });
    // Simulate the passage of time in THIS DISPOSABLE DATABASE only.
    await pool.query(`
      UPDATE games SET scheduled_at=timezone('America/New_York',clock_timestamp()-interval '1 hour'),
        is_completed=true,home_score=8,away_score=0 WHERE id='future';
      UPDATE line_combo_forecasts SET starts_at=(SELECT scheduled_at AT TIME ZONE 'America/New_York' FROM games WHERE id='future'),
        captured_at=(SELECT scheduled_at AT TIME ZONE 'America/New_York' FROM games WHERE id='future')-interval '1 minute';
      INSERT INTO game_goals(game_id,team_id,scorer_id) SELECT 'future','team','a' FROM generate_series(1,8);
      INSERT INTO game_attendance SELECT 'future','team',id FROM unnest(ARRAY['a','b','c','d','e','f'])p(id);
    `);
    await t.test("actual scored games tune the formula beyond merely updating player averages", async () => {
      await evaluate();
      const before = await first();
      assert.equal(before.actual_points, 8);
      const query = new PgDialect().sqlToQuery(lineComboHistoryQuery("team", true));
      const stats = buildLineComboStats((await pool!.query(query.sql, query.params)).rows as ComboHistoryRow[]);
      stats.learning = await loadLineComboCalibration(pool!, "team");
      const base = ["a", "b", "c"].reduce((sum, id) => sum + stats.players.find(p => p.playerId === id)!.pointsPerGame, 0);
      const projected = projectLineCombo(stats, "forward", ["a", "b", "c"])!;
      assert.equal(stats.learning.evaluatedGames, 1);
      assert.equal(projected.tuningGames, 1);
      assert.notEqual(projected.pointsPerGame, base, "Verified outcomes change the estimate beyond player averages.");
      await capture();
      assert.equal((await first()).base_ppg, before.base_ppg, "A completed game's baseline must remain frozen.");
    });
    await t.test("late score corrections replace outcomes against the frozen opponent-adjusted baseline", async () => {
      await pool!.query("UPDATE game_goals SET scorer_id='d' WHERE id IN(SELECT id FROM game_goals WHERE game_id='future' ORDER BY id LIMIT 2)");
      await evaluate();
      assert.equal((await first()).actual_points, 6);
      const state = await loadLineComboCalibration(pool!, "team");
      assert.equal(state.evaluatedGames, 1);
      const evidence = await pool!.query(`SELECT game_id AS "gameId",line_type AS "lineType",
        player_ids AS "playerIds",base_ppg AS "basePointsPerGame",actual_points AS "actualPoints"
        FROM line_combo_forecasts WHERE actual_points IS NOT NULL AND exclusion_reason IS NULL
        ORDER BY starts_at DESC,game_id DESC,line_type`);
      assert.deepEqual(state, learnLineComboCalibration(evidence.rows),
        "Corrections use the original matchup baseline, not the former additive-only baseline.");
    });
    await t.test("unsubmitted or incomplete scoring does not teach false zero production", async () => {
      await pool!.query("UPDATE game_goals SET is_submitted=false WHERE id=(SELECT min(id) FROM game_goals WHERE game_id='future')");
      await evaluate();
      assert.equal((await first()).actual_points, null);
      assert.equal((await first()).exclusion_reason, "scoring-not-final");
      assert.equal((await loadLineComboCalibration(pool!, "team")).evaluatedGames, 0);
      await pool!.query("UPDATE game_goals SET is_submitted=true WHERE game_id='future'");
    });
    await t.test("uncompleted games and test-labelled final lineups are excluded", async () => {
      await pool!.query("UPDATE games SET is_completed=false WHERE id='future'");
      await evaluate(); assert.equal((await first()).exclusion_reason, "game-not-complete");
      await pool!.query("UPDATE games SET is_completed=true WHERE id='future'; INSERT INTO line_combinations VALUES('test','team','future','[TEST] Future','forward',1,true)");
      await evaluate(); assert.equal((await first()).exclusion_reason, "test-lineup");
      await pool!.query("DELETE FROM line_combinations WHERE id='test'");
    });
    await t.test("template outcomes require attendance and rescheduled games are not misattributed", async () => {
      await pool!.query("DELETE FROM game_attendance WHERE user_id='a'");
      await evaluate(); assert.equal((await first()).exclusion_reason, "attendance-not-confirmed");
      await pool!.query("INSERT INTO game_attendance VALUES('future','team','a'); UPDATE games SET scheduled_at=scheduled_at+interval '1 minute' WHERE id='future'");
      await evaluate(); assert.equal((await first()).exclusion_reason, "game-rescheduled");
      await pool!.query("UPDATE games SET scheduled_at=scheduled_at-interval '1 minute' WHERE id='future'");
    });
    await t.test("an actual zero-goal final is a legitimate training result", async () => {
      await pool!.query("DELETE FROM game_goals WHERE game_id='future'; UPDATE games SET home_score=0 WHERE id='future'");
      await evaluate();
      assert.equal((await first()).actual_points, 0);
      assert.equal((await first()).exclusion_reason, null);
      assert.equal((await loadLineComboCalibration(pool!, "team")).evaluatedGames, 1);
      await pool!.query("INSERT INTO game_goals(game_id,team_id,scorer_id,is_submitted) VALUES('future','team','a',false)");
      await evaluate();
      assert.equal((await first()).actual_points, null, "A pending draft goal invalidates an apparent zero-goal final.");
      assert.equal((await first()).exclusion_reason, "scoring-not-final");
    });
  } finally {
    await pool?.end();
    await admin.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
    await admin.end();
  }
});
