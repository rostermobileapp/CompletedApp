import assert from "node:assert/strict";
import { test } from "node:test";
import pg from "pg";
import { PgDialect } from "drizzle-orm/pg-core";
import { type SQL } from "drizzle-orm";
import { getSeasonPatchCounts } from "./seasonPatchStats";

const socket = process.env.PATCH_STATS_TEST_SOCKET;

test("patch statistics execute against isolated PostgreSQL with season and roster isolation", {
  skip: !socket,
}, async () => {
  assert.ok(socket?.startsWith("/tmp/roster-patch-stats-"), "Only an isolated local test socket is allowed");
  const client = new pg.Client({
    host: socket, port: 5546, user: "patchstats", database: "postgres",
    password: "local-test-only", ssl: false,
  });
  const dialect = new PgDialect();
  await client.connect();
  try {
    await client.query(`
      SET TIME ZONE 'America/Los_Angeles';
      CREATE TEMP TABLE leagues (id text PRIMARY KEY, timezone text);
      CREATE TEMP TABLE seasons (
        id text PRIMARY KEY, league_id text, start_date timestamp, end_date timestamp, is_active boolean
      );
      CREATE TEMP TABLE games (id text, league_id text, season_id text, scheduled_at timestamp);
      CREATE TEMP TABLE badge_definitions (id text PRIMARY KEY, achievement_type text);
      CREATE TEMP TABLE badge_awards (
        user_id text, badge_definition_id text, tier text, scope_key text, count integer, awarded_at timestamp
      );
      INSERT INTO leagues VALUES ('league', 'America/New_York'), ('other', 'America/New_York');
      INSERT INTO seasons VALUES ('season', 'league', '2026-09-01', '2026-09-30', false),
        ('other-season', 'other', '2026-09-01', '2026-09-30', false);
      INSERT INTO badge_definitions VALUES ('achievement', 'tiered'), ('trivia', 'tiered'), ('repeat', 'multiplier');
      INSERT INTO badge_awards VALUES
        ('skater', 'achievement', 'bronze', 'global:tier:bronze', 100, '2026-09-01 04:00:00'),
        ('skater', 'achievement', 'silver', 'global:tier:silver', 250, '2026-09-30 23:00:00'),
        ('skater', 'trivia', 'bronze', 'trivia:lifetime:tier:bronze', 25, '2026-10-01 03:59:59'),
        ('skater', 'trivia', 'silver', 'trivia:lifetime:tier:silver', 50, '2026-10-01 04:00:00'),
        ('skater', 'repeat', NULL, 'global:count:1', 1, '2026-08-20 12:00:00'),
        ('skater', 'repeat', NULL, 'global:count:3', 3, '2026-09-20 12:00:00'),
        ('skater', 'repeat', NULL, 'global:count:8', 8, '2026-10-20 12:00:00'),
        ('goalie', 'achievement', 'bronze', 'global:tier:bronze', 10, '2026-09-20 12:00:00'),
        ('unrelated', 'achievement', 'bronze', 'global:tier:bronze', 10, '2026-09-20 12:00:00');
    `);
    const execute = async (query: SQL) => {
      const compiled = dialect.sqlToQuery(query);
      return client.query(compiled.sql, compiled.params);
    };
    const result = await getSeasonPatchCounts({ execute }, {
      leagueId: "league", seasonId: "season", userIds: ["skater", "goalie", null, "placeholder"],
    });
    assert.equal(result.get("skater"), 5);
    assert.equal(result.get("goalie"), 1);
    assert.equal(result.get("placeholder") ?? 0, 0);
    assert.equal(result.has("unrelated"), false);
    const allTime = await getSeasonPatchCounts({ execute }, {
      leagueId: "league", userIds: ["skater"],
    });
    assert.equal(allTime.get("skater"), 12);
    await assert.rejects(getSeasonPatchCounts({ execute }, {
      leagueId: "league", seasonId: "other-season", userIds: ["skater"],
    }), /does not belong/);
  } finally {
    await client.end();
  }
});
