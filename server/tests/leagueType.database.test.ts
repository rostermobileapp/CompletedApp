import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { drizzle } from "drizzle-orm/node-postgres";
import { getTableConfig } from "drizzle-orm/pg-core";
import { leagues, insertLeagueSchema } from "../../shared/schema";
import { LEAGUE_TYPES, leagueTypeSchema } from "../../shared/leagueType";
import { createStaffFixture } from "./helpers/highSchoolStaffFixture";

test("league types validate and persist without changing legacy league data", async () => {
  const f = await createStaffFixture();
  try {
    // Reproduce the pre-migration columns using the actual Drizzle definition.
    // Test-only constraints unrelated to classification are intentionally absent.
    const columns = getTableConfig(leagues).columns.filter(column => column.name !== "league_type")
      .map(column => column.name === "id" ? '"id" varchar PRIMARY KEY DEFAULT gen_random_uuid()'
        : `"${column.name}" ${column.columnType === "PgEnumColumn" ? "text" : column.getSQLType()}`);
    await f.pool.query(`DROP TABLE public.leagues; CREATE TABLE public.leagues(${columns.join(",")})`);
    await f.pool.query("INSERT INTO public.leagues(name) VALUES('Legacy fixture league')");
    const migration = await readFile("migrations/0059_league_type.sql", "utf8");
    await f.pool.query(migration);
    await f.pool.query(migration);
    const legacy = (await f.pool.query("SELECT name,league_type FROM public.leagues")).rows;
    assert.deepEqual(legacy, [{ name: "Legacy fixture league", league_type: "adult" }]);
    const db = drizzle(f.pool);
    let index = 1;
    for (const leagueType of LEAGUE_TYPES) {
      const values = insertLeagueSchema.parse({ name: `${leagueType} fixture`, leagueType,
        sport: "hockey", uniqueLeagueId: `L0000${index++}`, commissionerId: f.actors.parent.authId });
      const [saved] = await db.insert(leagues).values(values).returning({ leagueType: leagues.leagueType });
      assert.equal(saved.leagueType, leagueType);
    }
    const [legacyClient] = await db.insert(leagues).values(insertLeagueSchema.parse({
      name: "Older client", sport: "hockey", uniqueLeagueId: "L00009", commissionerId: f.actors.parent.authId,
    })).returning({ leagueType: leagues.leagueType });
    assert.equal(legacyClient.leagueType, "adult");
    for (const invalid of ["other", "", "HIGH_SCHOOL", null, 42, {}]) {
      assert.equal(leagueTypeSchema.safeParse(invalid).success, false);
      assert.equal(insertLeagueSchema.safeParse({ name: "Invalid fixture", leagueType: invalid,
        sport: "hockey", uniqueLeagueId: "L00008", commissionerId: f.actors.parent.authId }).success, false);
    }
    await assert.rejects(f.pool.query("INSERT INTO public.leagues(name,league_type) VALUES('Invalid fixture','other')"));
    await assert.rejects(f.pool.query("INSERT INTO public.leagues(name,league_type) VALUES('Invalid fixture',NULL)"));
  } finally { await f.close(); }
});
