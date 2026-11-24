import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { readActiveProSeats, readHasActiveProSeat } from "../proSeatReader";

test("actual seat queries and restricted prediction columns agree in an isolated local database", async () => {
  const connection = process.env.TEST_DATABASE_URL;
  if (!connection) throw new Error("TEST_DATABASE_URL is required");
  const url = new URL(connection);
  if (url.hostname !== "127.0.0.1" || url.port !== "56439" || url.pathname !== "/pro_coverage_test") {
    throw new Error("This test may only use the isolated local pro_coverage_test database on port 56439");
  }
  const pool = new Pool({ connectionString: connection });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`CREATE TABLE users(id varchar PRIMARY KEY,role text DEFAULT 'free_tier');
      CREATE TABLE leagues(id varchar PRIMARY KEY,name text);
      CREATE TABLE league_memberships(user_id varchar,league_id varchar,status text);
      INSERT INTO users(id) VALUES('parent');
      INSERT INTO leagues VALUES('HS','School'),('ADULT','Adult'),('OTHER','Other');
      INSERT INTO league_memberships VALUES('parent','HS','approved'),('parent','ADULT','approved'),('parent','OTHER','approved');`);
    await client.query(await readFile(new URL("../../migrations/0013_add_league_pro_grants_and_seats.sql", import.meta.url), "utf8"));
    const grant = async (id: string, league: string, start: string, end: string, status = "paid") => {
      await client.query(`INSERT INTO league_pro_grants(id,league_id,seat_count,start_month,end_month,months_count,
        per_player_monthly_cents,individual_total_cents,discounted_total_cents,savings_cents,discount_percent,status)
        VALUES($1,$2,10,$3,$4,1,100,1000,750,250,25,$5)`, [id, league, start, end, status]);
      await client.query("INSERT INTO league_pro_seats(grant_id,league_id,user_id) VALUES($1,$2,'parent')", [id, league]);
    };
    await grant("school","HS","2026-11","2027-02");
    await grant("overlap","HS","2027-01","2027-04");
    await grant("adult","ADULT","2026-10","2026-11");
    await grant("pending","OTHER","2026-11","2027-04","pending");
    const db = drizzle(client) as unknown as Parameters<typeof readActiveProSeats>[0];
    assert.equal(await readHasActiveProSeat(db,"parent","HS","2026-10"),false);
    for (const month of ["2026-11","2027-02","2027-04"]) assert.equal(await readHasActiveProSeat(db,"parent","HS",month),true);
    assert.equal(await readHasActiveProSeat(db,"parent","HS","2027-05"),false);
    assert.equal(await readHasActiveProSeat(db,"parent","OTHER","2026-11"),false);
    assert.equal(await readHasActiveProSeat(db,"parent","ADULT","2026-11"),true);
    assert.equal(await readHasActiveProSeat(db,"parent","ADULT","2026-12"),false);
    assert.equal((await readActiveProSeats(db,"parent","2027-02")).length,2);
    await client.query("UPDATE league_memberships SET status='removed' WHERE league_id='HS'");
    assert.equal(await readHasActiveProSeat(db,"parent","HS","2027-02"),false);
    assert.deepEqual(await readActiveProSeats(db,"parent","2027-02"),[]);
    await client.query("UPDATE league_memberships SET status='approved' WHERE league_id='HS'");
    // A corrupt seat pointing at a grant bought by another league must fail.
    await client.query("UPDATE league_pro_seats SET league_id='OTHER' WHERE grant_id='school'");
    assert.equal(await readHasActiveProSeat(db,"parent","OTHER","2026-11"),false);
    assert.deepEqual((await client.query("SELECT role FROM users")).rows,[{role:"free_tier"}]);

    await client.query(`CREATE ROLE anon; CREATE ROLE authenticated;
      CREATE TABLE game_predictions(game_id text, home_team_id text,away_team_id text,
        home_win_probability numeric,away_win_probability numeric,tie_probability numeric,
        calculated_at timestamptz,moneyline_home text,top_scorers_home jsonb,viewer text);
      ALTER TABLE game_predictions ENABLE ROW LEVEL SECURITY;
      CREATE POLICY game_predictions_team_read ON game_predictions FOR SELECT TO authenticated
        USING(viewer=current_setting('request.jwt.claim.sub',true));
      GRANT SELECT ON game_predictions TO authenticated;
      INSERT INTO game_predictions VALUES('visible','a','b',.6,.4,0,now(),'-150','[]','parent'),
        ('hidden','c','d',.5,.5,0,now(),'+100','[]','someone-else');
      CREATE TABLE private_fixture(value text);
      INSERT INTO private_fixture VALUES('not-public');
      ALTER TABLE private_fixture ENABLE ROW LEVEL SECURITY;
      GRANT SELECT ON private_fixture TO authenticated;`);
    const before = (await client.query("SELECT qual FROM pg_policies WHERE tablename='game_predictions'")).rows;
    const migration = (await readFile(new URL("../../migrations/0058_prediction_summary_column_access.sql", import.meta.url),"utf8"))
      .replace(/^BEGIN;|^COMMIT;/gm,"");
    await client.query(migration);
    assert.deepEqual((await client.query("SELECT qual FROM pg_policies WHERE tablename='game_predictions'")).rows,before);
    await client.query("SET LOCAL ROLE authenticated");
    await client.query("SELECT set_config('request.jwt.claim.sub','parent',true)");
    assert.deepEqual((await client.query("SELECT game_id,home_win_probability FROM game_predictions")).rows,
      [{game_id:"visible",home_win_probability:"0.6"}]);
    assert.equal((await client.query("SELECT * FROM private_fixture")).rowCount,0);
    for (const sql of ["SELECT * FROM game_predictions","SELECT moneyline_home FROM game_predictions","SELECT top_scorers_home FROM game_predictions"]) {
      await client.query("SAVEPOINT denied_read");
      await assert.rejects(client.query(sql), (e: any) => e.code==="42501");
      await client.query("ROLLBACK TO SAVEPOINT denied_read");
    }
    await client.query("SELECT set_config('request.jwt.claim.sub','stranger',true)");
    assert.equal((await client.query("SELECT game_id FROM game_predictions")).rowCount,0);
    await client.query("RESET ROLE");
  } finally {
    await client.query("ROLLBACK"); client.release(); await pool.end();
  }
});
