// Isolated loopback database only; never connects to app data.
import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { loadLineComboOpponent } from "../lineComboOpponent";

test("next-opponent selection, scored history isolation and neutral fallback", {timeout:30000}, async t => {
  const config={host:"127.0.0.1",port:55442,user:"award_test",password:"",ssl:false,max:2};
  const admin=new pg.Pool({...config,database:"postgres"});
  const database=`opponent_predictions_${process.pid}`;
  let pool:pg.Pool|undefined;
  try {
    await admin.query(`CREATE DATABASE "${database}"`);
    pool=new pg.Pool({...config,database});
    await pool.query(`
      CREATE TABLE leagues(id text PRIMARY KEY,timezone text);
      CREATE TABLE teams(id text PRIMARY KEY,name text);
      CREATE TABLE games(id text PRIMARY KEY,league_id text,season_id text,home_team_id text,away_team_id text,
        scheduled_at timestamp,is_completed boolean,home_score integer,away_score integer,
        is_scrimmage boolean DEFAULT false,opponent_name text);
      INSERT INTO leagues VALUES('league','America/New_York'),('other-league','America/Los_Angeles');
      INSERT INTO teams VALUES('us','Our Team'),('them','Ice Owls'),('third','Third Team');
      INSERT INTO games(id,league_id,season_id,home_team_id,away_team_id,scheduled_at,is_completed,home_score,away_score)
      VALUES
        ('next','league','season','us','them',timezone('America/New_York',clock_timestamp()+interval '1 hour'),false,NULL,NULL),
        ('later','league','season','third','us',timezone('America/New_York',clock_timestamp()+interval '2 hours'),false,NULL,NULL),
        ('past-unfinished','league','season','us','third',timezone('America/New_York',clock_timestamp()-interval '1 hour'),false,NULL,NULL),
        ('home-history','league','season','them','third',timezone('America/New_York',clock_timestamp()-interval '3 days'),true,4,2),
        ('away-history','league','season','third','them',timezone('America/New_York',clock_timestamp()-interval '2 days'),true,6,0),
        ('old-season','league','old','them','third',timezone('America/New_York',clock_timestamp()-interval '30 days'),true,99,99),
        ('other-league','other-league','season','them','third',timezone('America/Los_Angeles',clock_timestamp()-interval '2 days'),true,99,99),
        ('missing-score','league','season','them','third',timezone('America/New_York',clock_timestamp()-interval '1 day'),true,NULL,3),
        ('negative-score','league','season','them','third',timezone('America/New_York',clock_timestamp()-interval '1 day'),true,-1,3),
        ('future-completed','league','season','them','third',timezone('America/New_York',clock_timestamp()+interval '3 hours'),true,99,99),
        ('external-history','league','season','them',NULL,timezone('America/New_York',clock_timestamp()-interval '2 days'),true,99,99);
      INSERT INTO games(id,league_id,season_id,home_team_id,away_team_id,scheduled_at,is_completed,home_score,away_score,is_scrimmage)
        VALUES('scrimmage','league','season','them','third',timezone('America/New_York',clock_timestamp()-interval '1 day'),true,99,99,true);
    `);
    await t.test("next real future game uses correct home/away rates, same-season league baseline and genuine zeroes",async()=>{
      const result=await loadLineComboOpponent(pool!,"us");
      assert.equal(result.gameId,"next");assert.equal(result.opponentName,"Ice Owls");
      assert.equal(result.gamesPlayed,2);assert.equal(result.goalsForPerGame,2);
      assert.equal(result.goalsAgainstPerGame,4);assert.equal(result.leagueGoalsPerTeam,3);
      assert.equal(result.status,"adjusted");
    });
    await t.test("frozen forecasts use their own opponent, not the team's nearest game",async()=>{
      const result=await loadLineComboOpponent(pool!,"us","later");
      assert.equal(result.gameId,"later");assert.equal(result.opponentId,"third");
      assert.equal(result.goalsForPerGame,4);assert.equal(result.goalsAgainstPerGame,2);
      assert.equal((await loadLineComboOpponent(pool!,"us","past-unfinished")).status,"no-upcoming-game");
    });
    await t.test("named external opponent remains visible but does not borrow unrelated scoring history",async()=>{
      await pool!.query("UPDATE games SET away_team_id=NULL,opponent_name='Visiting Club' WHERE id='next'");
      const result=await loadLineComboOpponent(pool!,"us");
      assert.equal(result.status,"untracked-opponent");assert.equal(result.opponentName,"Visiting Club");
      assert.equal(result.multiplier,1);
    });
    await t.test("no season history and no next game are explicit neutral states",async()=>{
      await pool!.query("UPDATE games SET away_team_id='them',season_id='new-season' WHERE id='next'");
      assert.equal((await loadLineComboOpponent(pool!,"us")).status,"no-scored-history");
      await pool!.query("UPDATE games SET is_completed=true WHERE id IN('next','later')");
      assert.equal((await loadLineComboOpponent(pool!,"us")).status,"no-upcoming-game");
    });
  } finally {
    await pool?.end();await admin.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`).catch(()=>{});await admin.end();
  }
});
