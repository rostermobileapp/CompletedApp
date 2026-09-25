import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../db.js";
import {
  ensureDefaultBadges, evaluateBadgesForUser, getPendingBadgeEvents,
  getSeasonOnFireStreak, getTrophyCase, reconcileSeasonOnFire,
} from "../badges.js";
import { ON_FIRE_TIERS } from "../../shared/onFireTiers.js";

test("On Fire awards the right artwork for streaks within each season", async () => {
  const run = randomUUID().replace(/-/g, "");
  const userId = `test_${run}_player`;
  const leagueId = `test_${run}_league`;
  const seasonA = `test_${run}_season_a`;
  const seasonB = `test_${run}_season_b`;
  const teamId = `test_${run}_team`;
  try {
    await ensureDefaultBadges();
    await db.execute(sql`
      INSERT INTO users (id, email, first_name, last_name, role, onboarding_completed,
        last_updated, created_at, updated_at, fee_exempt)
      VALUES (${userId}, ${`fire_${run}@example.com`}, 'Fire', 'Tester',
        'free_tier', false, NOW(), NOW(), NOW(), false)
    `);
    await db.execute(sql`
      INSERT INTO leagues (id, name, unique_league_id, sport, commissioner_id, is_active,
        playoff_started, sub_approval_workflow, created_at, updated_at)
      VALUES (${leagueId}, 'On Fire Test', ${`F${run.slice(0, 5)}`.toUpperCase()},
        'hockey', ${userId}, true, false, 'captain_and_commissioner', NOW(), NOW())
    `);
    await db.execute(sql`
      INSERT INTO seasons (id, name, league_id, is_active, start_date, created_at, updated_at)
      VALUES (${seasonA}, 'Winter', ${leagueId}, false, '2025-12-01', NOW(), NOW()),
        (${seasonB}, 'Spring', ${leagueId}, true, '2026-03-01', NOW(), NOW())
    `);
    await db.execute(sql`
      INSERT INTO teams (id, name, league_id, season_id, created_at, updated_at)
      VALUES (${teamId}, 'On Fire Team', ${leagueId}, ${seasonA}, NOW(), NOW())
    `);
    const addGame = async (suffix: string, seasonId: string, date: string, scored: boolean) => {
      const gameId = `test_${run}_${suffix}`;
      await db.execute(sql`
        INSERT INTO games (id, league_id, season_id, home_team_id, scheduled_at, is_completed)
        VALUES (${gameId}, ${leagueId}, ${seasonId}, ${teamId}, ${date}, true)
      `);
      await db.execute(sql`
        INSERT INTO game_attendance (game_id, team_id, user_id)
        VALUES (${gameId}, ${teamId}, ${userId})
      `);
      if (scored) await db.execute(sql`
        INSERT INTO game_goals (game_id, team_id, scorer_id, goal_number)
        VALUES (${gameId}, ${teamId}, ${userId}, 1)
      `);
      return gameId;
    };
    let gapGameId = "";
    for (let i = 1; i <= 20; i++) {
      const date = new Date(Date.UTC(2025, 11, 19 + i)).toISOString().slice(0, 10);
      const gameId = await addGame(`a${i}`, seasonA, `${date} 12:00:00`, i !== 11);
      if (i === 11) gapGameId = gameId;
    }
    for (let i = 1; i <= 3; i++) {
      await addGame(`b${i}`, seasonB, `2026-03-0${i} 12:00:00`, true);
    }
    assert.deepEqual(ON_FIRE_TIERS.map((tier) => tier.threshold), [3, 5, 10, 20]);
    assert.equal(await getSeasonOnFireStreak(userId, seasonA), 10);
    assert.equal(await getSeasonOnFireStreak(userId, seasonB), 3);

    await evaluateBadgesForUser(userId, { seasonId: seasonA }, "season_scoring_streak");
    await evaluateBadgesForUser(userId, { seasonId: seasonB }, "season_scoring_streak");
    const fireBadge = async (seasonId: string) => (await getTrophyCase(userId, seasonId))
      .sections.flatMap((section) => section.badges).find((badge) => badge.slug === "on_fire");
    assert.equal((await fireBadge(seasonA))?.currentProgress, 10);
    assert.deepEqual((await fireBadge(seasonA))?.earnedTiers, ["bronze", "silver", "gold"]);
    assert.equal((await fireBadge(seasonB))?.currentProgress, 3);
    assert.deepEqual((await fireBadge(seasonB))?.earnedTiers, ["bronze"]);
    assert.deepEqual((await fireBadge(seasonB))?.tiers.map((tier) => tier.imagePath),
      ON_FIRE_TIERS.map((tier) => tier.imagePath));
    assert.equal((await getTrophyCase(userId)).selectedHatTrickSeasonId, seasonB);

    let events = (await getPendingBadgeEvents(userId))
      .filter((event) => event.definition.slug === "on_fire");
    assert.equal(events.length, 4);
    for (const event of events) {
      const payload = event.payload as Record<string, unknown>;
      assert.equal(payload.imagePath, ON_FIRE_TIERS.find((tier) => tier.tier === payload.tier)?.imagePath);
      assert.ok(payload.seasonId === seasonA || payload.seasonId === seasonB);
    }
    // A corrected goal bridges the two runs, earning Platinum with its own patch.
    await db.execute(sql`
      INSERT INTO game_goals (game_id, team_id, scorer_id, goal_number)
      VALUES (${gapGameId}, ${teamId}, ${userId}, 1)
    `);
    await evaluateBadgesForUser(userId, { seasonId: seasonA }, "season_scoring_streak");
    assert.equal((await fireBadge(seasonA))?.currentProgress, 20);
    events = (await getPendingBadgeEvents(userId)).filter((event) => event.definition.slug === "on_fire");
    assert.equal((events.find((event) => (event.payload as any).tier === "platinum")?.payload as any)?.imagePath,
      ON_FIRE_TIERS[3].imagePath);

    // A score correction removes the live Platinum tier, not Spring's Bronze.
    await db.execute(sql`DELETE FROM game_goals WHERE game_id = ${gapGameId}`);
    await evaluateBadgesForUser(userId, { seasonId: seasonA }, "season_scoring_streak");
    assert.deepEqual((await fireBadge(seasonA))?.earnedTiers, ["bronze", "silver", "gold"]);
    assert.deepEqual((await fireBadge(seasonB))?.earnedTiers, ["bronze"]);
    assert.equal((await getPendingBadgeEvents(userId)).filter((event) =>
      event.definition.slug === "on_fire" && (event.payload as any).tier === "platinum").length, 0);

    // A legacy career award stays in history without unlocking a season tier.
    await db.execute(sql`
      INSERT INTO badge_awards (badge_definition_id, user_id, scope_key, tier)
      SELECT id, ${userId}, 'global:tier:platinum', 'platinum'::badge_tier
      FROM badge_definitions WHERE slug = 'on_fire'
    `);
    assert.deepEqual((await fireBadge(seasonB))?.earnedTiers, ["bronze"]);
    assert.deepEqual((await fireBadge(seasonB))?.legacyAwards.map((award) => award.tier), ["platinum"]);

    // Reconciliation preserves earned history but does not replay announcements.
    const pendingBefore = (await getPendingBadgeEvents(userId)).filter((event) => event.definition.slug === "on_fire").length;
    await reconcileSeasonOnFire();
    assert.equal((await getPendingBadgeEvents(userId)).filter((event) => event.definition.slug === "on_fire").length, pendingBefore);
  } finally {
    await db.execute(sql`DELETE FROM game_goals WHERE game_id IN (SELECT id FROM games WHERE league_id = ${leagueId})`);
    await db.execute(sql`DELETE FROM games WHERE league_id = ${leagueId}`);
    await db.execute(sql`DELETE FROM teams WHERE league_id = ${leagueId}`);
    await db.execute(sql`DELETE FROM seasons WHERE league_id = ${leagueId}`);
    await db.execute(sql`DELETE FROM leagues WHERE id = ${leagueId}`);
    await db.execute(sql`DELETE FROM users WHERE id = ${userId}`);
  }
});