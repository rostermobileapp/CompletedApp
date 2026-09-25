import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../db.js";
import { ensureBadgeTables } from "../badgeDbInit.js";
import {
  evaluateBadgesForUser, getPendingBadgeEvents, getTrophyCase,
  reconcileFirstSubBadge,
} from "../badges.js";

test("Sub awards an approved player replacement once and backfills past substitutes silently", async () => {
  const run = randomUUID().replace(/-/g, "");
  const leagueId = `test_${run}_league`;
  const seasonId = `test_${run}_season`;
  const teamId = `test_${run}_team`;
  const gameId = `test_${run}_game`;
  const [original, newSub, pastSub, notGameSub] =
    ["original", "new", "past", "not_game"].map((role) => `test_${run}_${role}`);
  const [pendingRequest, historicalRequest, nonGameRequest, selfRequest] =
    ["pending", "historical", "non_game", "self"].map((name) => `test_${run}_${name}`);
  const awards = async (userId: string) => (await db.execute(sql`
    SELECT a.scope_key, d.image_path FROM badge_awards a
    JOIN badge_definitions d ON d.id = a.badge_definition_id
    WHERE a.user_id = ${userId} AND d.slug = 'sub'
  `)).rows;
  const events = async (userId: string) => (await db.execute(sql`
    SELECT e.payload FROM badge_earned_events e
    JOIN badge_definitions d ON d.id = e.badge_definition_id
    WHERE e.user_id = ${userId} AND d.slug = 'sub'
  `)).rows;

  try {
    await ensureBadgeTables();
    for (const userId of [original, newSub, pastSub, notGameSub]) {
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
      VALUES (${leagueId}, 'Sub Badge Test', ${`L${run.slice(0, 5)}`.toUpperCase()},
        'hockey', ${original}, true, false, 'captain_and_commissioner', 'America/New_York', NOW(), NOW())
    `);
    await db.execute(sql`
      INSERT INTO seasons (id, name, league_id, is_active, created_at, updated_at)
      VALUES (${seasonId}, 'Test', ${leagueId}, true, NOW(), NOW())
    `);
    await db.execute(sql`
      INSERT INTO teams (id, name, league_id, season_id, created_at, updated_at)
      VALUES (${teamId}, 'Home', ${leagueId}, ${seasonId}, NOW(), NOW())
    `);
    await db.execute(sql`
      INSERT INTO games (id, league_id, season_id, home_team_id, scheduled_at)
      VALUES (${gameId}, ${leagueId}, ${seasonId}, ${teamId}, '2026-05-01 12:00')
    `);
    await db.execute(sql`
      INSERT INTO substitute_requests
        (id, game_id, original_player_id, substitute_player_id, requesting_team_id, requested_by, status)
      VALUES (${pendingRequest}, ${gameId}, ${original}, ${newSub}, ${teamId}, ${original}, 'pending_substitute_approval'),
        (${historicalRequest}, ${gameId}, ${original}, ${pastSub}, ${teamId}, ${original}, 'approved'),
        (${nonGameRequest}, NULL, ${original}, ${notGameSub}, ${teamId}, ${original}, 'approved'),
        (${selfRequest}, ${gameId}, ${original}, ${original}, ${teamId}, ${original}, 'approved')
    `);
    await evaluateBadgesForUser(newSub, undefined, "first_sub_appearance");
    assert.equal((await awards(newSub)).length, 0);
    await reconcileFirstSubBadge();
    assert.equal((await awards(pastSub)).length, 1);
    assert.equal((await events(pastSub)).length, 0);
    assert.equal((await getPendingBadgeEvents(pastSub))
      .filter((event) => event.definition.slug === "sub").length, 0);
    assert.equal((await awards(notGameSub)).length, 0);
    assert.equal((await awards(original)).length, 0);

    await db.execute(sql`UPDATE substitute_requests SET status = 'approved' WHERE id = ${pendingRequest}`);
    await evaluateBadgesForUser(newSub, undefined, "first_sub_appearance");
    await evaluateBadgesForUser(newSub, undefined, "first_sub_appearance");
    assert.equal((await awards(newSub)).length, 1);
    assert.equal((await awards(newSub))[0].scope_key, "global");
    assert.equal((await awards(newSub))[0].image_path, "/badges/sub/patch.webp");
    assert.equal((await events(newSub)).length, 1);
    assert.equal(((await events(newSub))[0].payload as { imagePath: string }).imagePath,
      "/badges/sub/patch.webp");
    assert.equal((await getTrophyCase(pastSub)).sections.flatMap((section) => section.badges)
      .find((badge) => badge.slug === "sub")?.isEarned, true);
    await reconcileFirstSubBadge();
    assert.equal((await awards(newSub)).length, 1);
    assert.equal((await events(pastSub)).length, 0);
    assert.equal((await getPendingBadgeEvents(newSub))
      .filter((event) => event.definition.slug === "sub").length, 1);
  } finally {
    await db.execute(sql`DELETE FROM substitute_requests WHERE id IN (${pendingRequest}, ${historicalRequest}, ${nonGameRequest}, ${selfRequest})`);
    await db.execute(sql`DELETE FROM games WHERE id = ${gameId}`);
    await db.execute(sql`DELETE FROM teams WHERE id = ${teamId}`);
    await db.execute(sql`DELETE FROM seasons WHERE id = ${seasonId}`);
    await db.execute(sql`DELETE FROM leagues WHERE id = ${leagueId}`);
    for (const userId of [original, newSub, pastSub, notGameSub]) {
      await db.execute(sql`DELETE FROM users WHERE id = ${userId}`);
    }
  }
});