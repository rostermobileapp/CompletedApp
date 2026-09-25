import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../db.js";
import {
  currentCenturyClubYear, ensureDefaultBadges, evaluateBadgesForUser,
  getCalendarYearBeerCount, getPendingBadgeEvents, getTrophyCase,
  reconcileCalendarYearBeerMe,
} from "../badges.js";
import { ensureBeerBadgeEvaluationQueue, processPendingBeerBadgeEvaluations } from "../beerBadgeEvaluationQueue.js";

test("Beer Me combines seasons within a calendar year and resets on January 1", async () => {
  const run = randomUUID().replace(/-/g, "");
  const userId = `test_${run}_player`;
  const leagueId = `test_${run}_league`;
  const seasonA = `test_${run}_season_a`;
  const seasonB = `test_${run}_season_b`;
  const teamId = `test_${run}_team`;
  const year = currentCenturyClubYear();
  try {
    await ensureDefaultBadges();
    await ensureBeerBadgeEvaluationQueue();
    await db.execute(sql`
      INSERT INTO users (id, email, first_name, last_name, role, onboarding_completed,
        last_updated, created_at, updated_at, fee_exempt)
      VALUES (${userId}, ${`beer_${run}@example.com`}, 'Beer', 'Tester',
        'free_tier', false, NOW(), NOW(), NOW(), false)
    `);
    await db.execute(sql`
      INSERT INTO leagues (id, name, unique_league_id, sport, commissioner_id, is_active,
        playoff_started, sub_approval_workflow, created_at, updated_at)
      VALUES (${leagueId}, 'Beer Test', ${`B${run.slice(0, 5)}`.toUpperCase()},
        'hockey', ${userId}, true, false, 'captain_and_commissioner', NOW(), NOW())
    `);
    await db.execute(sql`
      INSERT INTO seasons (id, name, league_id, is_active, created_at, updated_at)
      VALUES (${seasonA}, 'Winter', ${leagueId}, false, NOW(), NOW()),
        (${seasonB}, 'Spring', ${leagueId}, true, NOW(), NOW())
    `);
    await db.execute(sql`
      INSERT INTO teams (id, name, league_id, season_id, created_at, updated_at)
      VALUES (${teamId}, 'Beer Test Team', ${leagueId}, ${seasonA}, NOW(), NOW())
    `);
    const addBeerGame = async (suffix: string, seasonId: string, date: string, count: number) => {
      const gameId = `test_${run}_${suffix}`;
      await db.execute(sql`
        INSERT INTO games (id, league_id, season_id, home_team_id, scheduled_at, is_completed)
        VALUES (${gameId}, ${leagueId}, ${seasonId}, ${teamId}, ${date}, true)
      `);
      await db.execute(sql`
        INSERT INTO game_beer_counts (user_id, game_id, count)
        VALUES (${userId}, ${gameId}, ${count})
      `);
      return gameId;
    };
    await addBeerGame("old", seasonA, `${year - 1}-12-31 23:59:00`, 30);
    await addBeerGame("new_a", seasonA, `${year}-01-01 00:01:00`, 7);
    const newB = await addBeerGame("new_b", seasonB, `${year}-02-01 12:00:00`, 4);
    assert.equal(await getCalendarYearBeerCount(userId, year - 1), 30);
    assert.equal(await getCalendarYearBeerCount(userId, year), 11);
    const queued = await db.execute(sql`
      SELECT season_id FROM beer_badge_evaluation_queue WHERE user_id = ${userId}
    `);
    assert.deepEqual(
      queued.rows.map((row) => String(row.season_id)).sort(),
      [`year:${year - 1}`, `year:${year}`],
    );

    await evaluateBadgesForUser(userId, { year: year - 1 }, "calendar_year_beers");
    await evaluateBadgesForUser(userId, { year }, "calendar_year_beers");
    const beerBadge = (await getTrophyCase(userId)).sections.flatMap((section) => section.badges)
      .find((badge) => badge.slug === "beer_me");
    assert.equal(beerBadge?.count, 11);
    assert.equal(beerBadge?.currentProgress, 11);
    assert.deepEqual(beerBadge?.earnedTiers, ["bronze", "silver"]);
    assert.ok(beerBadge?.awards.every((award) => award.scopeKey.startsWith(`year:${year}:tier:`)));
    assert.ok(beerBadge?.legacyAwards.some((award) => award.scopeKey.startsWith(`year:${year - 1}:tier:`)));
    assert.equal((await getPendingBadgeEvents(userId))
      .filter((event) => event.definition.slug === "beer_me").length, 2);

    await db.execute(sql`UPDATE game_beer_counts SET count = 0 WHERE game_id = ${newB}`);
    await evaluateBadgesForUser(userId, { year }, "calendar_year_beers");
    assert.equal((await getTrophyCase(userId)).sections.flatMap((section) => section.badges)
      .find((badge) => badge.slug === "beer_me")?.currentProgress, 7);
    assert.equal((await getPendingBadgeEvents(userId))
      .filter((event) => event.definition.slug === "beer_me").length, 1);
    await db.execute(sql`UPDATE game_beer_counts SET count = 4 WHERE game_id = ${newB}`);
    await evaluateBadgesForUser(userId, { year }, "calendar_year_beers");
    assert.equal((await getPendingBadgeEvents(userId))
      .filter((event) => event.definition.slug === "beer_me").length, 2);
    await reconcileCalendarYearBeerMe();
    assert.equal((await getTrophyCase(userId)).sections.flatMap((section) => section.badges)
      .find((badge) => badge.slug === "beer_me")?.currentProgress, 11);

    const flushQueuedChanges = async () => {
      // Keep the running app's polling worker away from this test user's jobs.
      // The targeted drain bypasses the normal debounce while retaining the
      // same claim, evaluation and acknowledgement code path.
      await db.execute(sql`
        UPDATE beer_badge_evaluation_queue
        SET requested_at = NOW() + INTERVAL '1 day',
          available_at = NOW() + INTERVAL '1 day',
          claimed_at = NULL, claimed_version = NULL
        WHERE user_id = ${userId}
      `);
      await processPendingBeerBadgeEvaluations(userId);
    };
    const savedProgress = async () => {
      const result = await db.execute(sql`
        SELECT bp.progress FROM badge_progress bp
        JOIN badge_definitions bd ON bd.id = bp.badge_definition_id
        WHERE bd.slug = 'beer_me' AND bp.user_id = ${userId}
          AND bp.scope_key = ${`year:${year}`}
      `);
      return Number(result.rows[0]?.progress);
    };
    // Removing a game leaves beer rows in this schema; the game trigger must
    // still recalculate from the remaining joined games.
    await db.execute(sql`DELETE FROM games WHERE id = ${newB}`);
    const deleteQueue = await db.execute(sql`SELECT season_id, version, processed_version FROM beer_badge_evaluation_queue WHERE user_id = ${userId}`);
    assert.ok(deleteQueue.rows.some((row) => row.season_id === `year:${year}` && Number(row.version) > Number(row.processed_version)),
      `Game deletion did not enqueue current year: ${JSON.stringify(deleteQueue.rows)}`);
    assert.equal(await getCalendarYearBeerCount(userId, year), 7);
    await flushQueuedChanges();
    assert.equal(await savedProgress(), 7);
    const newA = `test_${run}_new_a`;
    await db.execute(sql`
      UPDATE games SET scheduled_at = ${`${year - 1}-12-31 23:59:00`}
      WHERE id = ${newA}
    `);
    await flushQueuedChanges();
    assert.equal(await savedProgress(), 0);
    assert.equal(await getCalendarYearBeerCount(userId, year - 1), 37);
    assert.equal((await getPendingBadgeEvents(userId))
      .filter((event) => event.definition.slug === "beer_me").length, 0);
    await db.execute(sql`
      UPDATE games SET scheduled_at = ${`${year}-01-01 00:01:00`}
      WHERE id = ${newA}
    `);
    await flushQueuedChanges();
    assert.equal(await savedProgress(), 7);
  } finally {
    await db.execute(sql`DELETE FROM game_beer_counts WHERE user_id = ${userId}`);
    await db.execute(sql`DELETE FROM games WHERE league_id = ${leagueId}`);
    await db.execute(sql`DELETE FROM teams WHERE league_id = ${leagueId}`);
    await db.execute(sql`DELETE FROM seasons WHERE league_id = ${leagueId}`);
    await db.execute(sql`DELETE FROM leagues WHERE id = ${leagueId}`);
    await db.execute(sql`DELETE FROM users WHERE id = ${userId}`);
  }
});