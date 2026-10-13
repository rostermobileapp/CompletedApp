import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../db.js";
import { ensureBadgeTables } from "../badgeDbInit.js";
import { getTrophyCase, reconcileSeasonBeercules } from "../badges.js";

test("Beercules awards tied beer leaders for completed seasons only", async () => {
  const run = randomUUID().replace(/-/g, "");
  const leagueId = `test_${run}_league`;
  const teamId = `test_${run}_team`;
  const closedSeasonId = `test_${run}_closed`;
  const expiredSeasonId = `test_${run}_expired`;
  const activeSeasonId = `test_${run}_active`;
  const userIds = ["a", "b", "c", "d"].map((suffix) => `test_${run}_${suffix}`);
  const [a, b, c, d] = userIds;
  const gameIds = ["closed_one", "closed_two", "scrimmage", "expired", "active"]
    .map((suffix) => `test_${run}_${suffix}`);

  const awards = async (userId: string) => (await db.execute(sql`
    SELECT a.season_id, a.scope_key, a.metadata, d.image_path
    FROM badge_awards a
    JOIN badge_definitions d ON d.id = a.badge_definition_id
    WHERE d.slug = 'beercules' AND a.user_id = ${userId}
    ORDER BY a.season_id
  `)).rows;

  try {
    await ensureBadgeTables();
    for (const userId of userIds) {
      await db.execute(sql`
        INSERT INTO users (id, email, first_name, last_name, role, onboarding_completed,
          last_updated, created_at, updated_at, fee_exempt)
        VALUES (${userId}, ${`${userId}@example.com`}, 'Player', 'Test',
          'free_tier', false, NOW(), NOW(), NOW(), false)
      `);
    }
    await db.execute(sql`
      INSERT INTO leagues (id, name, unique_league_id, sport, commissioner_id, is_active,
        playoff_started, sub_approval_workflow, timezone, created_at, updated_at)
      VALUES (${leagueId}, 'Beercules Test', ${`L${run.slice(0, 5)}`.toUpperCase()},
        'hockey', ${d}, true, false, 'captain_and_commissioner', 'America/New_York', NOW(), NOW())
    `);
    await db.execute(sql`
      INSERT INTO seasons (id, name, league_id, is_active, end_date, created_at, updated_at)
      VALUES (${closedSeasonId}, 'Closed', ${leagueId}, false, NULL, NOW(), NOW()),
        (${expiredSeasonId}, 'Past end date', ${leagueId}, true, '2025-01-01', NOW(), NOW()),
        (${activeSeasonId}, 'Active', ${leagueId}, true, NULL, NOW(), NOW())
    `);
    await db.execute(sql`
      INSERT INTO teams (id, name, league_id, season_id, created_at, updated_at)
      VALUES (${teamId}, 'Test Team', ${leagueId}, ${closedSeasonId}, NOW(), NOW())
    `);
    await db.execute(sql`
      INSERT INTO games (id, league_id, season_id, home_team_id, scheduled_at, is_scrimmage)
      VALUES (${gameIds[0]}, ${leagueId}, ${closedSeasonId}, ${teamId}, '2024-10-01 12:00', false),
        (${gameIds[1]}, ${leagueId}, ${closedSeasonId}, ${teamId}, '2024-10-08 12:00', false),
        (${gameIds[2]}, ${leagueId}, ${closedSeasonId}, ${teamId}, '2024-10-09 12:00', true),
        (${gameIds[3]}, ${leagueId}, ${expiredSeasonId}, ${teamId}, '2024-11-01 12:00', false),
        (${gameIds[4]}, ${leagueId}, ${activeSeasonId}, ${teamId}, '2024-12-01 12:00', false)
    `);
    await db.execute(sql`
      INSERT INTO game_beer_counts (user_id, game_id, count)
      VALUES (${a}, ${gameIds[0]}, 4), (${a}, ${gameIds[1]}, 4),
        (${b}, ${gameIds[0]}, 2), (${b}, ${gameIds[1]}, 5),
        (${b}, ${gameIds[2]}, 1), (${c}, ${gameIds[1]}, 2),
        (${c}, ${gameIds[3]}, 7), (${a}, ${gameIds[4]}, 100)
    `);

    assert.equal(await reconcileSeasonBeercules(true), 3);
    assert.equal(await reconcileSeasonBeercules(true), 0);

    for (const userId of [a, b]) {
      const result = await awards(userId);
      assert.equal(result.length, 1);
      assert.equal(result[0].season_id, closedSeasonId);
      assert.equal((result[0].metadata as { beersConsumed: number }).beersConsumed, 8);
      assert.equal(result[0].image_path, "/badges/beercules/patch-v1.webp");
      const trophyCase = await getTrophyCase(userId);
      const section = trophyCase.sections.find((item) => item.category === "season_award");
      assert.equal(section?.label, "Season Awards");
      assert.equal(section?.badges.find((badge) => badge.slug === "beercules")?.isEarned, true);
    }
    assert.equal((await awards(c))[0]?.season_id, expiredSeasonId);
    assert.equal((await awards(c))[0]?.metadata?.beersConsumed, 7);
    assert.equal((await awards(d)).length, 0);
  } finally {
    await db.execute(sql`DELETE FROM game_beer_counts WHERE game_id IN (${sql.join(gameIds.map((id) => sql`${id}`), sql`, `)})`);
    await db.execute(sql`DELETE FROM games WHERE id IN (${sql.join(gameIds.map((id) => sql`${id}`), sql`, `)})`);
    await db.execute(sql`DELETE FROM teams WHERE id = ${teamId}`);
    await db.execute(sql`DELETE FROM seasons WHERE id IN (${closedSeasonId}, ${expiredSeasonId}, ${activeSeasonId})`);
    await db.execute(sql`DELETE FROM leagues WHERE id = ${leagueId}`);
    for (const userId of userIds) await db.execute(sql`DELETE FROM users WHERE id = ${userId}`);
  }
});
