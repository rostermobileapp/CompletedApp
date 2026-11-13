import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import pg from "pg";

// This test is pinned to a disposable local PostgreSQL server, never app DB URLs.
const config = { host: "127.0.0.1", port: 55442, user: "award_test", password: "", ssl: false, max: 3 };

test("scorekeeper and win-chance changes are queued and debounced", { timeout: 30000 }, async (t) => {
  const admin = new pg.Pool({ ...config, database: "postgres" });
  const database = `scorekeeper_recalc_${process.pid}`;
  let pool: pg.Pool | undefined;
  try {
    await admin.query(`CREATE DATABASE "${database}"`);
    pool = new pg.Pool({ ...config, database });
    await pool.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN EXECUTE 'CREATE ROLE anon NOLOGIN'; END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN EXECUTE 'CREATE ROLE authenticated NOLOGIN'; END IF;
      END $$;
      CREATE TABLE leagues(id varchar PRIMARY KEY, timezone text);
      CREATE TABLE users(id varchar PRIMARY KEY);
      CREATE TABLE teams(id varchar PRIMARY KEY, league_id varchar, wins integer DEFAULT 0,
        losses integer DEFAULT 0, ties integer DEFAULT 0, goals_for integer DEFAULT 0, goals_against integer DEFAULT 0);
      CREATE TABLE games(id varchar PRIMARY KEY, league_id varchar, home_team_id varchar, away_team_id varchar,
        scheduled_at timestamp, is_completed boolean DEFAULT false, is_scrimmage boolean DEFAULT false,
        home_score integer, away_score integer, result_type text);
      CREATE TABLE game_goals(id varchar PRIMARY KEY, game_id varchar, is_submitted boolean DEFAULT false);
      CREATE TABLE game_penalties(id varchar PRIMARY KEY, game_id varchar);
      CREATE TABLE game_attendance(id varchar PRIMARY KEY, game_id varchar);
      CREATE TABLE game_goalies(id varchar PRIMARY KEY, game_id varchar, goalie_user_id varchar);
      CREATE TABLE game_rsvps(id varchar PRIMARY KEY, game_id varchar, user_id varchar, team_id varchar,
        status text, updated_at timestamptz DEFAULT clock_timestamp());
      CREATE TABLE team_memberships(user_id varchar, team_id varchar, status text, position text);
      CREATE TABLE league_memberships(user_id varchar, assigned_team_id varchar, league_id varchar,
        status text, is_goalie boolean DEFAULT false);
      CREATE TABLE player_stats(user_id varchar, league_id varchar, games_played integer DEFAULT 0,
        goals integer DEFAULT 0, assists integer DEFAULT 0);
      INSERT INTO leagues VALUES ('league', 'America/New_York');
      INSERT INTO teams(id,league_id) VALUES ('home','league'),('away','league');
      INSERT INTO games(id,league_id,home_team_id,away_team_id,scheduled_at)
        VALUES ('final','league','home','away',clock_timestamp()::timestamp),
               ('upcoming','league','home','away',(clock_timestamp()+interval '1 day')::timestamp);
    `);
    const migration = await readFile(
      new URL("../../migrations/0050_scorekeeper_recalculation_queues.sql", import.meta.url),
      "utf8",
    );
    await pool.query(migration);
    const saveMigration = await readFile(
      new URL("../../migrations/0051_deferred_scorekeeper_finalization.sql", import.meta.url),
      "utf8",
    );
    await pool.query(saveMigration);

    await t.test("saved games can be identified and attributed without completing them", async () => {
      await pool!.query("INSERT INTO users(id) VALUES('scorekeeper')");
      await pool!.query(`
        UPDATE games SET home_score=2, away_score=1,
          scorekeeper_saved_at=clock_timestamp(), scorekeeper_saved_by='scorekeeper'
        WHERE id='upcoming'
      `);
      const saved = (await pool!.query(`
        SELECT scorekeeper_saved_at, scorekeeper_saved_by, is_completed
        FROM games WHERE id='upcoming'
      `)).rows[0];
      assert.ok(saved.scorekeeper_saved_at);
      assert.equal(saved.scorekeeper_saved_by, "scorekeeper");
      assert.equal(saved.is_completed, false);
      await pool!.query(`
        UPDATE games SET home_score=NULL, away_score=NULL,
          scorekeeper_saved_at=NULL, scorekeeper_saved_by=NULL
        WHERE id='upcoming'
      `);
    });

    await t.test("first completion is immediate; later edits debounce per game", async () => {
      await pool!.query("UPDATE games SET is_completed=true, home_score=2, away_score=1 WHERE id='final'");
      const first = (await pool!.query(
        "SELECT * FROM scorekeeper_game_recalculation_queue WHERE game_id='final'",
      )).rows[0];
      assert.ok(first);
      assert.equal(first.badges_done, false);
      assert.equal(first.line_combo_done, false);
      assert.equal(first.win_odds_done, false);
      assert.ok(new Date(first.due_at).getTime() <= Date.now() + 1000);

      await pool!.query("INSERT INTO game_goals(id,game_id,is_submitted) VALUES('goal','final',true)");
      await pool!.query("UPDATE games SET home_score=3 WHERE id='final'");
      const corrected = (await pool!.query(
        "SELECT revision,due_at FROM scorekeeper_game_recalculation_queue WHERE game_id='final'",
      )).rows[0];
      assert.ok(Number(corrected.revision) >= 3);
      assert.ok(new Date(corrected.due_at).getTime() > Date.now() + 4 * 60 * 1000);
      assert.equal((await pool!.query(
        "SELECT count(*)::int AS count FROM scorekeeper_game_recalculation_queue",
      )).rows[0].count, 1);
    });

    await t.test("RSVP changes queue their single upcoming game", async () => {
      await pool!.query(
        "INSERT INTO game_rsvps(id,game_id,user_id,team_id,status) VALUES('rsvp','upcoming','player','home','attending')",
      );
      await pool!.query(
        "UPDATE game_rsvps SET status='not_attending',updated_at=clock_timestamp() WHERE id='rsvp'",
      );
      const rows = (await pool!.query(
        "SELECT * FROM win_chance_recalculation_queue WHERE event_type='rsvp_game'",
      )).rows;
      assert.equal(rows.length, 1);
      assert.equal(rows[0].entity_id, "upcoming");
      assert.equal(Number(rows[0].revision), 2);
      assert.ok(new Date(rows[0].due_at).getTime() > Date.now() + 4 * 60 * 1000);
    });

    await t.test("team inputs coalesce; scorekeeper stats do not duplicate team refreshes", async () => {
      await pool!.query("UPDATE teams SET wins=1 WHERE id='home'");
      await pool!.query("UPDATE teams SET goals_for=2 WHERE id='home'");
      let teamJobs = (await pool!.query(
        "SELECT * FROM win_chance_recalculation_queue WHERE event_type='team'",
      )).rows;
      assert.equal(teamJobs.length, 1);
      assert.equal(Number(teamJobs[0].revision), 2);

      await pool!.query(`
        BEGIN;
        SELECT set_config('app.scorekeeper_game_id','final',true);
        INSERT INTO player_stats(user_id,league_id,goals) VALUES('player','league',1);
        COMMIT;
      `);
      teamJobs = (await pool!.query(
        "SELECT * FROM win_chance_recalculation_queue WHERE event_type='team'",
      )).rows;
      assert.equal(teamJobs.length, 1);
    });
  } finally {
    await pool?.end();
    await admin.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
    await admin.end();
  }
});
