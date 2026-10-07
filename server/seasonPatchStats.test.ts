import assert from "node:assert/strict";
import { test } from "node:test";
import { PgDialect } from "drizzle-orm/pg-core";
import { type SQL } from "drizzle-orm";
import { getSeasonPatchCounts } from "./seasonPatchStats";

const dialect = new PgDialect();
const seasonRow = {
  start_date: "2026-09-01", end_date: "2026-09-30", is_active: false,
  first_game: null, last_game: null, timezone: "America/New_York",
};
const row = (changes: Record<string, unknown> = {}) => ({
  user_id: "player", badge_definition_id: "patch", tier: "bronze",
  scope_key: "global:tier:bronze", count: 100, awarded_at: "2026-09-15T12:00:00Z",
  achievement_type: "tiered", ...changes,
});

test("batched patch lookup uses the selected league and season and parameterized player IDs", async () => {
  const queries: ReturnType<typeof dialect.sqlToQuery>[] = [];
  const execute = async (query: SQL) => {
    queries.push(dialect.sqlToQuery(query));
    return { rows: queries.length === 1 ? [seasonRow] : [
      row(), row({ tier: "silver" }), row({ user_id: "goalie" }),
    ] };
  };
  const result = await getSeasonPatchCounts({ execute }, {
    leagueId: "league", seasonId: "season", userIds: ["player", null, "goalie", "player"],
  });
  assert.equal(result.get("player"), 2);
  assert.equal(result.get("goalie"), 1);
  assert.equal(queries.length, 2);
  assert.deepEqual(queries[0].params, ["season", "league"]);
  assert.deepEqual(queries[1].params, ["player", "goalie", "2026-10-01T04:00:00.000Z"]);
  assert.match(queries[1].sql, /badge_awards/);
  assert.doesNotMatch(queries[1].sql, /badge_earned_events/);
});

test("no season filter uses all-time earnings and an empty roster performs no database work", async () => {
  let calls = 0;
  const execute = async (query: SQL) => {
    calls++;
    assert.doesNotMatch(dialect.sqlToQuery(query).sql, /FROM seasons/);
    return { rows: [row()] };
  };
  assert.equal((await getSeasonPatchCounts({ execute }, { leagueId: "league", userIds: [] })).size, 0);
  assert.equal(calls, 0);
  assert.equal((await getSeasonPatchCounts({ execute }, { leagueId: "league", userIds: ["player"] })).get("player"), 1);
  assert.equal(calls, 1);
});

test("an unknown/wrong-league season fails rather than counting lifetime patches", async () => {
  await assert.rejects(getSeasonPatchCounts({ execute: async () => ({ rows: [] }) }, {
    leagueId: "league", seasonId: "other-league-season", userIds: ["player"],
  }), /does not belong/);
});

test("an undated unscheduled season returns zero without loading lifetime awards", async () => {
  let calls = 0;
  const result = await getSeasonPatchCounts({ execute: async () => {
    calls++;
    return { rows: [{ ...seasonRow, start_date: null, end_date: null }] };
  } }, { leagueId: "league", seasonId: "season", userIds: ["player"] });
  assert.equal(result.size, 0);
  assert.equal(calls, 1);
});
