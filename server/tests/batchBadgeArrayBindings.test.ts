import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { transformSync } from "esbuild";
import { sql } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

// Execute the actual function without importing application startup or a live DB.
const file = ts.createSourceFile("badges.ts", readFileSync("server/badges.ts", "utf8"), ts.ScriptTarget.Latest, true);
const node = file.statements.find((statement) =>
  ts.isFunctionDeclaration(statement) && statement.name?.text === "loadBatchBadgeMetrics");
assert.ok(node);
const compiled = transformSync(`${node.getText(file)}; loadBatchBadgeMetrics`, { loader: "ts" }).code;
const dialect = new PgDialect();
const definitions = [
  "season_hat_tricks", "career_shutouts", "consecutive_games_out",
  "consecutive_games_played", "season_scoring_streak", "season_48hr_rsvp_perfect",
  "season_rsvp_perfect",
].map((triggerKey) => ({ triggerKey }));

for (const ids of [["player-1"], ["player-1", "player-2"], ["player'quoted", "player-2", "player-1"]]) {
  test(`every batch badge branch binds ${ids.length} participants as array parameters`, async () => {
    const queries: ReturnType<PgDialect["sqlToQuery"]>[] = [];
    const load = runInNewContext(compiled, {
      sql, Map, Set, Array,
      currentCenturyClubYear: () => 2026,
      db: { execute: async (statement: any) => {
        queries.push(dialect.sqlToQuery(statement));
        return { rows: [] };
      } },
    });
    await load([...ids, ids[0], ""], definitions, { seasonId: "season", year: 2026 });
    assert.equal(queries.length, 9, "all conditional metric branches were exercised");
    let bindings = 0;
    for (const query of queries) {
      const casts = [...query.sql.matchAll(/\$(\d+)::text\[\]/g)];
      for (const [, index] of casts) {
        assert.deepEqual(query.params[Number(index) - 1], ids);
        bindings++;
      }
      assert.doesNotMatch(query.sql, /\(\$\d+(?:,\s*\$\d+)*\)::text\[\]/);
      for (const id of ids) assert.ok(!query.sql.includes(id), "IDs never become SQL text");
    }
    assert.ok(bindings >= 12, "unnest, ANY, and reused participant sources were checked");
  });
}

test("an empty participant batch makes no database requests", async () => {
  const load = runInNewContext(compiled, {
    sql, currentCenturyClubYear: () => 2026,
    db: { execute: () => assert.fail("unexpected query") },
  });
  const result = await load([], definitions, { seasonId: "season" });
  assert.equal(result.values.size, 0);
});
