import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../db.js";
import {
  ensureDefaultBadges, evaluateBadgesForUser, getPendingBadgeEvents,
  getSeasonHatTrickCount, getTrophyCase, reconcileSeasonHatTricks,
} from "../badges.js";
import { HAT_TRICK_TIERS } from "../../shared/hatTrickTiers.js";

test("Hat Trick counts qualifying games separately per season, not goals or calendar years", async () => {
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
      VALUES (${userId}, ${`hat_${run}@example.com`}, 'Hat', 'Tester',
        'free_tier', false, NOW(), NOW(), NOW(), false)
    `);
    await db.execute(sql`
      INSERT INTO leagues (id, name, unique_league_id, sport, commissioner_id, is_active,
        playoff_started, sub_approval_workflow, created_at, updated_at)
      VALUES (${leagueId}, 'Hat Trick Test', ${`H${run.slice(0, 5)}`.toUpperCase()},
        'hockey', ${userId}, true, false, 'captain_and_commissioner', NOW(), NOW())
    `);
    await db.execute(sql`
      INSERT INTO seasons (id, name, league_id, is_active, start_date, created_at, updated_at)
      VALUES (${seasonA}, 'Winter', ${leagueId}, false, '2025-12-01', NOW(), NOW()),
        (${seasonB}, 'Spring', ${leagueId}, true, '2026-02-01', NOW(), NOW())
    `);
    await db.execute(sql`
      INSERT INTO teams (id, name, league_id, season_id, created_at, updated_at)
      VALUES (${teamId}, 'Hat Test Team', ${leagueId}, ${seasonA}, NOW(), NOW())
    `);
    const addGame = async (suffix: string, seasonId: string, date: string, goals: number, completed = true) => {
      const gameId = `test_${run}_${suffix}`;
      await db.execute(sql`
        INSERT INTO games (id, league_id, season_id, home_team_id, scheduled_at, is_completed)
        VALUES (${gameId}, ${leagueId}, ${seasonId}, ${teamId}, ${date}, ${completed})
      `);
      for (let number = 1; number <= goals; number++) {
        await db.execute(sql`
          INSERT INTO game_goals (game_id, team_id, scorer_id, goal_number)
          VALUES (${gameId}, ${teamId}, ${userId}, ${number})
        `);
      }
      return gameId;
    };
    await addGame("a1", seasonA, "2025-12-20 12:00:00", 3);
    await addGame("a2", seasonA, "2026-01-10 12:00:00", 4);
    await addGame("a3", seasonA, "2026-01-17 12:00:00", 5);
    await addGame("a_pending", seasonA, "2026-01-24 12:00:00", 6, false);
    const b1 = await addGame("b1", seasonB, "2026-03-01 12:00:00", 3);
    await addGame("b2", seasonB, "2026-03-08 12:00:00", 2);
    assert.equal(await getSeasonHatTrickCount(userId, seasonA), 3);
    assert.equal(await getSeasonHatTrickCount(userId, seasonB), 1);
    assert.deepEqual(HAT_TRICK_TIERS.map((tier) => tier.threshold), [1, 3, 5, 10]);

    await evaluateBadgesForUser(userId, { seasonId: seasonA }, "season_hat_tricks");
    await evaluateBadgesForUser(userId, { seasonId: seasonB }, "season_hat_tricks");
    const winter = (await getTrophyCase(userId, seasonA)).sections.flatMap((section) => section.badges)
      .find((badge) => badge.slug === "hat_trick");
    const spring = (await getTrophyCase(userId, seasonB)).sections.flatMap((section) => section.badges)
      .find((badge) => badge.slug === "hat_trick");
    assert.equal(winter?.currentProgress, 3);
    assert.deepEqual(winter?.earnedTiers, ["bronze", "silver"]);
    assert.equal(spring?.currentProgress, 1);
    assert.deepEqual(spring?.earnedTiers, ["bronze"]);
    assert.deepEqual(spring?.tiers.map((tier) => tier.imagePath), HAT_TRICK_TIERS.map((tier) => tier.imagePath));
    assert.equal((await getTrophyCase(userId)).selectedHatTrickSeasonId, seasonB);

    const events = (await getPendingBadgeEvents(userId))
      .filter((event) => event.definition.slug === "hat_trick");
    assert.equal(events.length, 3);
    for (const event of events) {
      const payload = event.payload as Record<string, unknown>;
      assert.equal(payload.imagePath, HAT_TRICK_TIERS.find((tier) => tier.tier === payload.tier)?.imagePath);
      assert.ok(payload.seasonId === seasonA || payload.seasonId === seasonB);
    }

    for (let i = 4; i <= 10; i++) {
      await addGame(`a${i}`, seasonA, `2026-02-${String(i).padStart(2, "0")} 12:00:00`, 3);
    }
    await evaluateBadgesForUser(userId, { seasonId: seasonA }, "season_hat_tricks");
    const milestoneEvents = (await getPendingBadgeEvents(userId))
      .filter((event) => event.definition.slug === "hat_trick");
    assert.equal(milestoneEvents.length, 5);
    for (const tier of HAT_TRICK_TIERS) {
      const event = milestoneEvents.find((item) =>
        (item.payload as Record<string, unknown>).seasonId === seasonA
        && (item.payload as Record<string, unknown>).tier === tier.tier);
      assert.equal((event?.payload as Record<string, unknown>)?.imagePath, tier.imagePath);
    }
    assert.equal((await getTrophyCase(userId, seasonA)).sections.flatMap((section) => section.badges)
      .find((badge) => badge.slug === "hat_trick")?.currentProgress, 10);

    // A corrected score below three goals removes live progress in that season,
    // without altering awards earned in a different season.
    await db.execute(sql`DELETE FROM game_goals WHERE game_id = ${b1} AND goal_number = 3`);
    assert.equal(await getSeasonHatTrickCount(userId, seasonB), 0);
    await evaluateBadgesForUser(userId, { seasonId: seasonB }, "season_hat_tricks");
    assert.deepEqual((await getTrophyCase(userId, seasonB)).sections.flatMap((section) => section.badges)
      .find((badge) => badge.slug === "hat_trick")?.earnedTiers, []);
    assert.equal((await getPendingBadgeEvents(userId))
      .filter((event) => event.definition.slug === "hat_trick").length, 4);
    await db.execute(sql`
      INSERT INTO game_goals (game_id, team_id, scorer_id, goal_number)
      VALUES (${b1}, ${teamId}, ${userId}, 3)
    `);
    await evaluateBadgesForUser(userId, { seasonId: seasonB }, "season_hat_tricks");
    assert.equal((await getPendingBadgeEvents(userId))
      .filter((event) => event.definition.slug === "hat_trick").length, 5);

    // A legacy career award stays in history without advancing any season's tiers.
    await db.execute(sql`
      INSERT INTO badge_awards (badge_definition_id, user_id, scope_key, tier)
      SELECT id, ${userId}, 'global:tier:gold', 'gold'::badge_tier
      FROM badge_definitions WHERE slug = 'hat_trick'
    `);
    const history = (await getTrophyCase(userId, seasonB)).sections.flatMap((section) => section.badges)
      .find((badge) => badge.slug === "hat_trick");
    assert.deepEqual(history?.earnedTiers, ["bronze"]);
    assert.deepEqual(history?.legacyAwards.map((award) => award.tier), ["gold"]);

    await db.execute(sql`DELETE FROM game_goals WHERE game_id IN (SELECT id FROM games WHERE season_id = ${seasonB})`);
    assert.ok((await getTrophyCase(userId)).hatTrickSeasons.some((season) => season.id === seasonB));
    await reconcileSeasonHatTricks();
    assert.equal((await getTrophyCase(userId, seasonA)).sections.flatMap((section) => section.badges)
      .find((badge) => badge.slug === "hat_trick")?.currentProgress, 10);
  } finally {
    await db.execute(sql`DELETE FROM game_goals WHERE game_id IN (SELECT id FROM games WHERE league_id = ${leagueId})`);
    await db.execute(sql`DELETE FROM games WHERE league_id = ${leagueId}`);
    await db.execute(sql`DELETE FROM teams WHERE league_id = ${leagueId}`);
    await db.execute(sql`DELETE FROM seasons WHERE league_id = ${leagueId}`);
    await db.execute(sql`DELETE FROM leagues WHERE id = ${leagueId}`);
    await db.execute(sql`DELETE FROM users WHERE id = ${userId}`);
  }
});