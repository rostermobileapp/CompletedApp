import { before, after, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import pg from "pg";
import { fixtureAdmin } from "./helpers/predictionFixtureDb.js";
import { loadScope, loadTeamData, recalculateTeam } from "../../supabase/functions/recalculate-win-chance/calculator.js";
import { aggregateResults, buildTeamInput, headToHead, type GameRow } from "../../supabase/functions/recalculate-win-chance/modelInputs.js";
import { isFutureGame, localTimestamp } from "../../supabase/functions/recalculate-win-chance/gameTime.js";
import { formatWinChanceRecord } from "../../shared/winChanceRecord.js";

const now = Date.parse("2026-11-13T01:00:00Z");
const mavScores = [[10,3],[8,4],[7,4],[8,3],[6,4],[5,10],[8,5],[7,3],[5,3]];
const neonScores = [[6,3],[4,8],[4,4],[3,7],[3,8],[2,6],[4,8],[3,7],[3,6]];
function history(team: string, scores: number[][]): GameRow[] {
  return scores.map(([home_score, away_score], i) => ({
    id: `${team}-${i}`, home_team_id: team, away_team_id: "opponent", home_score, away_score,
    scheduled_at: `2026-11-${String(i + 1).padStart(2,"0")}T20:00:00`, is_completed: i > 0,
    is_scrimmage: false, season_id: "season", league_id: "league", result_type: team === "mavs" && i === 5 ? "shootout" : "regulation",
  }));
}

describe("prediction input rules", () => {
  test("derives the reported records and goals, including scored legacy games", () => {
    assert.deepEqual(aggregateResults("mavs", history("mavs", mavScores)), {
      gamesPlayed:9,wins:8,losses:0,ties:0,shootoutLosses:1,goalsFor:64,goalsAgainst:39,streak:3,
    });
    assert.deepEqual(aggregateResults("neon", history("neon", neonScores)), {
      gamesPlayed:9,wins:1,losses:7,ties:1,shootoutLosses:0,goalsFor:32,goalsAgainst:57,streak:-6,
    });
  });
  test("displays complete records without inventing missing legacy categories", () => {
    assert.equal(formatWinChanceRecord({ wins:8,losses:0,ties:0,shootoutLosses:1 }), "8-0-0-1");
    assert.equal(formatWinChanceRecord({ wins:1,losses:7,ties:1,shootoutLosses:0 }), "1-7-1-0");
    assert.equal(formatWinChanceRecord({ wins:0,losses:0,ties:0 }), "0-0-0");
  });
  test("uses league-local dates for future games and historical cutoffs", () => {
    assert.equal(localTimestamp(now,"America/New_York"),"2026-11-12T20:00:00");
    assert.equal(isFutureGame("2026-11-12T21:00:00", now,"America/New_York"),true);
    assert.equal(isFutureGame("2026-11-12T19:00:00", now,"America/New_York"),false);
    assert.equal(isFutureGame("2026-11-13T00:00:00Z", now,"America/New_York"),false);
    assert.equal(localTimestamp(Date.parse("2026-07-01T01:00:00Z"),"America/New_York"),"2026-06-30T21:00:00");
  });
  test("does not modify the supplied model", async () => {
    assert.equal(await readFile("supabase/functions/recalculate-win-chance/winProbability.ts","utf8"),
      await readFile("attached_assets/0_winProbability_1794508276740.ts","utf8"));
  });
});

const url = process.env.WIN_CHANCE_TEST_DB_URL;
describe("prediction loader and guarded persistence", { skip: !url }, () => {
  let pool: pg.Pool;
  let admin: ReturnType<typeof fixtureAdmin>;
  before(async () => {
    const config = new URL(url!);
    if (!["127.0.0.1","localhost"].includes(config.hostname) || config.pathname !== "/win_chance_test") {
      throw new Error("Refusing non-local prediction test database");
    }
    pg.types.setTypeParser(1114, value => value.replace(" ","T"));
    pool = new pg.Pool({ connectionString:url,ssl:false,max:4 });
    admin = fixtureAdmin(pool);
    await pool.query(`
      DROP SCHEMA public CASCADE; CREATE SCHEMA public;
      DO $$ BEGIN
        IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
        IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
        IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role; END IF;
      END $$;
      CREATE TABLE leagues(id text PRIMARY KEY, allow_ties boolean, timezone text);
      ALTER ROLE service_role BYPASSRLS;
      DROP SCHEMA IF EXISTS auth CASCADE; CREATE SCHEMA auth;
      CREATE FUNCTION auth.uid() RETURNS text LANGUAGE sql STABLE AS
        $$ SELECT current_setting('request.jwt.claim.sub',true) $$;
      GRANT USAGE ON SCHEMA public,auth TO anon,authenticated,service_role;
      CREATE TABLE teams(id varchar PRIMARY KEY,name text,league_id text,season_id text,captain_id text,
        wins integer DEFAULT 0,losses integer DEFAULT 0,ties integer DEFAULT 0,goals_for integer DEFAULT 0,goals_against integer DEFAULT 0);
      CREATE TABLE games(id varchar PRIMARY KEY,home_team_id text,away_team_id text,home_score integer,away_score integer,
        scheduled_at timestamp,is_completed boolean,is_scrimmage boolean,season_id text,league_id text,result_type text);
      CREATE TABLE users(id text PRIMARY KEY,first_name text,last_name text);
      CREATE TABLE team_memberships(id serial,user_id text,team_id text,status text,position text);
      CREATE TABLE league_memberships(id serial,user_id text,league_id text,assigned_team_id text,status text,
        display_first_name text,display_last_name text,is_goalie boolean,is_skater boolean);
      CREATE TABLE placeholder_players(id text,team_id text,first_name text,last_name text,is_goalie boolean,is_skater boolean);
      CREATE TABLE player_stats(id serial,user_id text,league_id text,season_id text,games_played integer,goals integer,assists integer);
      CREATE TABLE game_attendance(id serial,game_id text,team_id text,user_id text,placeholder_player_id text);
      CREATE TABLE game_goals(id serial,game_id text,team_id text,scorer_id text,primary_assist_id text,secondary_assist_id text,is_submitted boolean);
      CREATE TABLE game_goalies(id serial,game_id text,team_id text,goalie_user_id text,goals_against integer DEFAULT 0);
      CREATE TABLE game_rsvps(id serial,game_id text,team_id text,user_id text,status text);
      CREATE TABLE dispatch_calls(team_id text);
      CREATE FUNCTION public.win_chance_dispatch_team(p_team_id varchar) RETURNS void LANGUAGE sql AS
        $$ INSERT INTO public.dispatch_calls VALUES(p_team_id) $$;
    `);
    const migration = await readFile("migrations/0047_game_win_predictions.sql","utf8");
    const table = migration.match(/CREATE TABLE IF NOT EXISTS public\.game_predictions[\s\S]*?\n\);/);
    if (!table) throw new Error("Prediction schema not found");
    await pool.query(table[0]);
    await pool.query(migration.slice(migration.indexOf("ALTER TABLE public.game_predictions ENABLE"),migration.indexOf("CREATE TABLE IF NOT EXISTS public.win_chance_dispatch_locks")));
    await pool.query(await readFile("migrations/0048_win_chance_safe_save.sql","utf8"));
    await pool.query("GRANT SELECT,INSERT,UPDATE ON ALL TABLES IN SCHEMA public TO service_role");
    await pool.query("GRANT SELECT ON team_memberships,league_memberships,teams TO authenticated");
  });
  after(async () => { if (pool) await pool.end(); });
  beforeEach(async () => {
    await pool.query(`TRUNCATE leagues,teams,games,users,team_memberships,league_memberships,placeholder_players,
      player_stats,game_attendance,game_goals,game_goalies,game_rsvps,game_predictions,dispatch_calls CASCADE`);
    await pool.query("INSERT INTO leagues VALUES ('league',false,'America/New_York')");
    await pool.query(`INSERT INTO teams(id,name,league_id,season_id) VALUES
      ('mavs','Mavericks','league','season'),('neon','Neon Green','league','season'),('opponent','Opponent','league','season'),
      ('foreign','Foreign','other','season'),('old','Old Season','league','previous')`);
    const games = [...history("mavs",mavScores),...history("neon",neonScores)];
    games.push({ ...games[0],id:"scrimmage",home_score:100,is_scrimmage:true });
    games.push({ ...games[0],id:"wrong-season",home_score:100,season_id:"previous" });
    games.push({ ...games[0],id:"outside-league",home_score:100,away_team_id:"foreign" });
    games.push({ ...games[0],id:"future-result",home_score:100,scheduled_at:"2099-01-01T20:00:00" });
    games.push({ ...games[0],id:"upcoming",home_team_id:"mavs",away_team_id:"neon",home_score:null,away_score:null,
      is_completed:false,scheduled_at:"2099-01-02T20:00:00" });
    games.push({ ...games[0],id:"started",home_score:null,away_score:null,is_completed:false,scheduled_at:"2026-01-01T20:00:00" });
    for (const game of games) await pool.query(`INSERT INTO games
      (id,home_team_id,away_team_id,home_score,away_score,scheduled_at,is_completed,is_scrimmage,season_id,league_id,result_type)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`, Object.values({
        id:game.id,home:game.home_team_id,away:game.away_team_id,hs:game.home_score,as:game.away_score,
        scheduled:game.scheduled_at,done:game.is_completed,scrimmage:game.is_scrimmage,season:game.season_id,league:game.league_id,result:game.result_type,
      }));
    for (const team of ["mavs","neon"]) {
      for (const suffix of ["star","depth","goalie"]) {
        const id = `${team}-${suffix}`;
        await pool.query("INSERT INTO users VALUES($1,$2,'Player')",[id,id]);
        await pool.query("INSERT INTO team_memberships(user_id,team_id,status,position) VALUES($1,$2,'approved',$3)",[id,team,suffix==="goalie"?"G":"C"]);
        await pool.query(`INSERT INTO league_memberships(user_id,league_id,assigned_team_id,status,is_goalie,is_skater)
          VALUES($1,'league',$2,'approved',$3,$4)`,[id,team,suffix==="goalie",suffix!=="goalie"]);
      }
    }
    await pool.query(`INSERT INTO player_stats(user_id,league_id,season_id,games_played,goals,assists) VALUES
      ('mavs-depth','league','season',9,3,4),('mavs-star','league','previous',50,100,100),
      ('neon-depth','league','season',9,2,3)`);
    await pool.query(`INSERT INTO game_attendance(game_id,team_id,user_id) VALUES
      ('mavs-0','mavs','mavs-star'),('mavs-1','mavs','mavs-star')`);
    await pool.query(`INSERT INTO game_goals(game_id,team_id,scorer_id,primary_assist_id,is_submitted) VALUES
      ('mavs-0','mavs','mavs-star','mavs-depth',true),('mavs-1','mavs','mavs-star',null,true),
      ('mavs-1','mavs','mavs-star',null,false)`);
    await pool.query("INSERT INTO game_goalies(game_id,team_id,goalie_user_id) VALUES('mavs-0','mavs','mavs-goalie')");
    await pool.query(`INSERT INTO game_rsvps(game_id,team_id,user_id,status) VALUES
      ('upcoming','mavs','mavs-star','not_attending'),('upcoming','mavs','mavs-depth','attending'),
      ('upcoming','neon','mavs-depth','not_attending')`);
  });
  const inputs = async () => {
    const scope = await loadScope(admin,"league","season","2026-11-12T20:00:00");
    const home = await loadTeamData(admin,scope.teams.find(row=>row.id==="mavs")!,scope.games,"season");
    const away = await loadTeamData(admin,scope.teams.find(row=>row.id==="neon")!,scope.games,"season");
    return {scope,home,away};
  };
  test("loads authoritative season records, stats, attendance, goalies, and RSVPs", async () => {
    const {scope,home,away} = await inputs();
    assert.equal(scope.games.length,18);
    assert.equal(scope.leagueAverage,192/36);
    const input = buildTeamInput(home,[]);
    assert.deepEqual([input.gamesPlayed,input.wins,input.losses,input.ties,input.goalsFor,input.goalsAgainst,input.streak],[9,8,0,1,64,39,3]);
    const star = input.skaters.find(row=>row.id==="mavs-star")!;
    assert.deepEqual([star.gamesPlayed,star.goals,star.assists],[2,2,0]);
    assert.deepEqual(star.recentGames,[{goals:1,assists:0},{goals:1,assists:0}]);
    assert.deepEqual(input.goalies[0].recentGoalsAgainst,[3,3,5,10,4]);
    assert.deepEqual([input.goalies[0].gamesPlayed,input.goalies[0].goalsAgainst],[9,39]);
    assert.equal(headToHead(home,away).length,0);
    assert.deepEqual(await recalculateTeam(admin,"mavs",now),{updated:1});
    const stored = (await pool.query("SELECT * FROM game_predictions")).rows[0];
    assert.deepEqual(stored.home_record_snapshot,{wins:8,losses:0,ties:0,shootoutLosses:1});
    assert.deepEqual(stored.away_record_snapshot,{wins:1,losses:7,ties:1,shootoutLosses:0});
    assert.ok(Number(stored.home_win_probability)>0.55941);
    assert.ok(Number(stored.expected_goals_home)>Number(stored.expected_goals_away));
    assert.ok(Number(stored.expected_goals_home)>1);
    assert.equal(stored.tie_probability,"0.00000");
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM game_predictions")).rows[0].n,1);
    const withRsvp = buildTeamInput(home,[{user_id:"mavs-star",status:"not_attending"},{user_id:"mavs-depth",status:"attending"}]);
    assert.equal(withRsvp.skaters.find(row=>row.id==="mavs-star")!.rsvp,"out");
    assert.equal(withRsvp.skaters.find(row=>row.id==="mavs-depth")!.rsvp,"in");
    assert.equal(buildTeamInput(away,[]).skaters[0].rsvp,"none");
  });
  test("keeps ties configurable and repeated unchanged calculations deterministic", async () => {
    await pool.query("UPDATE leagues SET allow_ties=true");
    await recalculateTeam(admin,"mavs",now);
    const first=(await pool.query("SELECT * FROM game_predictions")).rows[0];
    assert.ok(Number(first.tie_probability)>0);
    assert.ok(Math.abs(Number(first.home_win_probability)+Number(first.away_win_probability)+Number(first.tie_probability)-1)<0.00002);
    await recalculateTeam(admin,"mavs",now);
    assert.deepEqual((await pool.query("SELECT * FROM game_predictions")).rows[0],first);
  });
  test("excludes stale team assignments while retaining unassigned direct members", async () => {
    await pool.query("UPDATE league_memberships SET assigned_team_id='neon' WHERE user_id='mavs-star'");
    await pool.query("UPDATE league_memberships SET assigned_team_id=NULL WHERE user_id='mavs-depth'");
    const {home}=await inputs();
    assert.equal(home.roster.some(row=>row.id==="mavs-star"),false);
    assert.equal(home.roster.some(row=>row.id==="mavs-depth"),true);
  });
  test("uses placeholder attendance for a sole goalie without inventing ambiguous goalie records", async () => {
    await pool.query("DELETE FROM team_memberships WHERE user_id='mavs-goalie'");
    await pool.query("DELETE FROM league_memberships WHERE user_id='mavs-goalie'");
    await pool.query("DELETE FROM game_goalies WHERE team_id='mavs'");
    await pool.query("INSERT INTO placeholder_players VALUES('p-goalie','mavs','Placeholder','Goalie',true,false)");
    const {home}=await inputs();
    const goalie=buildTeamInput(home,[]).goalies[0];
    assert.equal(goalie.id,"placeholder:p-goalie");
    assert.deepEqual([goalie.gamesPlayed,goalie.goalsAgainst],[9,39]);
    await pool.query("INSERT INTO placeholder_players VALUES('second-goalie','mavs','Second','Goalie',true,false)");
    const ambiguous=await inputs();
    assert.ok(buildTeamInput(ambiguous.home,[]).goalies.every(row=>row.gamesPlayed===0));
    await pool.query("INSERT INTO game_attendance(game_id,team_id,placeholder_player_id) VALUES('mavs-0','mavs','p-goalie')");
    const assigned=await inputs();
    assert.equal(buildTeamInput(assigned.home,[]).goalies.find(row=>row.id==="placeholder:p-goalie")!.gamesPlayed,1);
  });
  test("includes confirmed zero-point placeholder participation in player history", async () => {
    await pool.query("INSERT INTO placeholder_players VALUES('p-skater','mavs','Placeholder','Skater',false,true)");
    await pool.query(`INSERT INTO game_attendance(game_id,team_id,placeholder_player_id) VALUES
      ('mavs-0','mavs','p-skater'),('mavs-1','mavs','p-skater')`);
    const {home}=await inputs();
    const player=buildTeamInput(home,[]).skaters.find(row=>row.id==="placeholder:p-skater")!;
    assert.deepEqual([player.gamesPlayed,player.goals,player.assists],[2,0,0]);
    assert.deepEqual(player.recentGames,[{goals:0,assists:0},{goals:0,assists:0}]);
  });
  test("the locked writer rejects completed games, older runs, reassigned seasons, and ordinary callers", async () => {
    await recalculateTeam(admin,"mavs",now);
    const row=(await pool.query("SELECT * FROM game_predictions")).rows[0];
    const args={p_prediction:row,p_league_id:"league",p_season_id:"season"};
    assert.equal((await admin.rpc("win_chance_save_prediction",{...args,p_prediction:{...row,calculated_at:"2020-01-01"}})).data,false);
    assert.equal((await admin.rpc("win_chance_save_prediction",{...args,p_season_id:"previous"})).data,false);
    await pool.query("UPDATE games SET is_completed=true,home_score=5,away_score=2 WHERE id='upcoming'");
    assert.equal((await admin.rpc("win_chance_save_prediction",args)).data,false);
    const client=await pool.connect();
    try {
      await client.query("SET ROLE authenticated");
      await assert.rejects(client.query("SELECT public.win_chance_save_prediction($1,'league','season')",[JSON.stringify(row)]),{code:"42501"});
    } finally {await client.query("RESET ROLE");client.release();}
    assert.deepEqual((await pool.query("SELECT * FROM game_predictions")).rows[0],row);
  });
  test("paginates past the first 500 scored games", async () => {
    await pool.query(`INSERT INTO games(id,home_team_id,away_team_id,home_score,away_score,scheduled_at,is_completed,is_scrimmage,season_id,league_id,result_type)
      SELECT 'extra-'||n,'mavs','opponent',1,0,'2026-01-01'::timestamp+n*interval '1 minute',true,false,'season','league','regulation'
      FROM generate_series(1,510) AS n`);
    const {home}=await inputs();
    assert.equal(buildTeamInput(home,[]).gamesPlayed,519);
  });
  test("only team members and captains can read, and only the service role can save", async () => {
    await recalculateTeam(admin,"mavs",now);
    const row=(await pool.query("SELECT * FROM game_predictions")).rows[0];
    const client=await pool.connect();
    try {
      await client.query("SET ROLE authenticated");
      await client.query("SELECT set_config('request.jwt.claim.sub','outsider',false)");
      assert.equal((await client.query("SELECT * FROM game_predictions")).rows.length,0);
      await client.query("SELECT set_config('request.jwt.claim.sub','mavs-star',false)");
      assert.equal((await client.query("SELECT * FROM game_predictions")).rows.length,1);
      await assert.rejects(client.query("UPDATE game_predictions SET home_streak=100"),{code:"42501"});
      await client.query("RESET ROLE");
      await client.query("UPDATE teams SET captain_id='captain' WHERE id='mavs'");
      await client.query("SET ROLE authenticated");
      await client.query("SELECT set_config('request.jwt.claim.sub','captain',false)");
      assert.equal((await client.query("SELECT * FROM game_predictions")).rows.length,1);
      await client.query("RESET ROLE");
      await client.query("SET ROLE service_role");
      assert.equal((await client.query("SELECT public.win_chance_save_prediction($1,'league','season') AS saved",[JSON.stringify(row)])).rows[0].saved,true);
    } finally {await client.query("RESET ROLE");client.release();}
  });
  test("OT/SO corrections dispatch work but schedule edits do not", async () => {
    await pool.query("UPDATE games SET result_type='regulation' WHERE id='mavs-5'");
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM dispatch_calls")).rows[0].n,2);
    await pool.query("TRUNCATE dispatch_calls");
    await pool.query("UPDATE games SET scheduled_at=scheduled_at+interval '1 hour' WHERE id='upcoming'");
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM dispatch_calls")).rows[0].n,0);
  });
  test("serializes prediction saves against scorekeeper finalization", async () => {
    await recalculateTeam(admin,"mavs",now);
    const row=(await pool.query("SELECT * FROM game_predictions")).rows[0];
    const scorekeeper=await pool.connect();
    const writer=await pool.connect();
    try {
      await scorekeeper.query("BEGIN");
      await scorekeeper.query("SELECT id FROM games WHERE id='upcoming' FOR UPDATE");
      await writer.query("BEGIN");
      await writer.query("SET LOCAL lock_timeout='50ms'");
      await assert.rejects(writer.query("SELECT public.win_chance_save_prediction($1,'league','season')",[JSON.stringify(row)]),{code:"55P03"});
      await writer.query("ROLLBACK");
      await scorekeeper.query("UPDATE games SET is_completed=true,home_score=4,away_score=1 WHERE id='upcoming'");
      await scorekeeper.query("COMMIT");
      assert.equal((await admin.rpc("win_chance_save_prediction",{p_prediction:row,p_league_id:"league",p_season_id:"season"})).data,false);
      assert.deepEqual((await pool.query("SELECT * FROM game_predictions")).rows[0],row);
    } finally {
      await scorekeeper.query("ROLLBACK");await writer.query("ROLLBACK");
      scorekeeper.release();writer.release();
    }
  });
});
