import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../db.js";
import { ensureBadgeTables } from "../badgeDbInit.js";
import {
  evaluateBadgesForUser, getCareerShutoutCount, getPendingBadgeEvents,
  getTrophyCase, getTrophyCasePreview, reconcileCareerShutouts,
} from "../badges.js";
import { LOCKED_IN_TIERS } from "../../shared/lockedInTiers.js";

test("Locked In counts lifetime goalie shutouts only and uses each patch for its tier", async () => {
  const run = randomUUID().replace(/-/g, "");
  const goalieId = `test_${run}_goalie`;
  const skaterId = `test_${run}_skater`;
  const leagueId = `test_${run}_league`;
  const seasonA = `test_${run}_season_a`;
  const seasonB = `test_${run}_season_b`;
  const teamId = `test_${run}_team`;
  const addGame = async (suffix: string, date: string, seasonId: string, awayScore: number,
    goalieOfRecord = true, scrimmage = false) => {
    const gameId = `test_${run}_${suffix}`;
    await db.execute(sql`
      INSERT INTO games (id, league_id, season_id, home_team_id, scheduled_at,
        is_completed, is_scrimmage, home_score, away_score)
      VALUES (${gameId}, ${leagueId}, ${seasonId}, ${teamId}, ${date},
        true, ${scrimmage}, 2, ${awayScore})
    `);
    if (goalieOfRecord) await db.execute(sql`
      INSERT INTO game_goalies (game_id, team_id, goalie_user_id, goals_against)
      VALUES (${gameId}, ${teamId}, ${goalieId}, 0)
    `);
    else await db.execute(sql`
      INSERT INTO game_attendance (game_id, team_id, user_id)
      VALUES (${gameId}, ${teamId}, ${goalieId})
    `);
    return gameId;
  };
  const goalieBadge = async () => (await getTrophyCase(goalieId)).sections
    .flatMap((section) => section.badges).find((badge) => badge.slug === "broom");
  try {
    await ensureBadgeTables();
    for (const [id, name] of [[goalieId, "Goalie"], [skaterId, "Skater"]]) {
      await db.execute(sql`
        INSERT INTO users (id, email, first_name, last_name, role, onboarding_completed,
          last_updated, created_at, updated_at, fee_exempt)
        VALUES (${id}, ${`locked_${name}_${run}@example.com`}, ${name}, 'Tester',
          'free_tier', false, NOW(), NOW(), NOW(), false)
      `);
    }
    await db.execute(sql`
      INSERT INTO leagues (id, name, unique_league_id, sport, commissioner_id, is_active,
        playoff_started, sub_approval_workflow, created_at, updated_at)
      VALUES (${leagueId}, 'Locked In Test', ${`L${run.slice(0, 5)}`.toUpperCase()},
        'hockey', ${goalieId}, true, false, 'captain_and_commissioner', NOW(), NOW())
    `);
    await db.execute(sql`
      INSERT INTO seasons (id, name, league_id, is_active, start_date, created_at, updated_at)
      VALUES (${seasonA}, 'Old Season', ${leagueId}, false, '2025-01-01', NOW(), NOW()),
        (${seasonB}, 'New Season', ${leagueId}, true, '2026-01-01', NOW(), NOW())
    `);
    await db.execute(sql`
      INSERT INTO teams (id, name, league_id, season_id, created_at, updated_at)
      VALUES (${teamId}, 'Goalie Team', ${leagueId}, ${seasonA}, NOW(), NOW())
    `);
    await db.execute(sql`
      INSERT INTO league_memberships (user_id, league_id, assigned_team_id, status, is_goalie, requested_at)
      VALUES (${goalieId}, ${leagueId}, ${teamId}, 'approved', true, '2026-01-01'),
        (${skaterId}, ${leagueId}, ${teamId}, 'approved', false, '2026-01-01')
    `);
    const first = await addGame("first", "2025-01-02 12:00:00", seasonA, 0);
    // A skater present at the same shutout does not receive a goalie award.
    await db.execute(sql`
      INSERT INTO game_attendance (game_id, team_id, user_id)
      VALUES (${first}, ${teamId}, ${skaterId})
    `);
    assert.equal(await getCareerShutoutCount(goalieId), 1);
    assert.equal(await getCareerShutoutCount(skaterId), 0);
    await evaluateBadgesForUser(goalieId, undefined, "career_shutouts");
    await evaluateBadgesForUser(skaterId, undefined, "career_shutouts");
    assert.equal((await goalieBadge())?.currentProgress, 1);
    assert.deepEqual((await goalieBadge())?.earnedTiers, ["bronze"]);
    assert.equal((await getTrophyCase(skaterId)).isGoalie, false);
    assert.equal((await getTrophyCase(skaterId)).sections.flatMap((section) => section.badges)
      .some((badge) => badge.slug === "broom"), false);
    const skaterProgress = await db.execute(sql`
      SELECT COUNT(*)::int AS count FROM badge_progress bp
      JOIN badge_definitions bd ON bd.id = bp.badge_definition_id
      WHERE bp.user_id = ${skaterId} AND bd.slug = 'broom'
    `);
    assert.equal(skaterProgress.rows[0]?.count, 0);

    // Include a goalie with confirmed attendance but no goalie-of-record row.
    for (let i = 2; i <= 25; i++) {
      const date = new Date(Date.UTC(2025, 0, 2 + i * 17)).toISOString().slice(0, 10);
      await addGame(`shutout${i}`, `${date} 12:00:00`,
        date.startsWith("2025") ? seasonA : seasonB, 0, i !== 3);
    }
    await addGame("scrimmage", "2026-04-01 12:00:00", seasonB, 0, true, true);
    await addGame("notashutout", "2026-04-02 12:00:00", seasonB, 1);
    assert.equal(await getCareerShutoutCount(goalieId), 25);
    await evaluateBadgesForUser(goalieId, undefined, "career_shutouts");
    assert.equal((await goalieBadge())?.currentProgress, 25);
    assert.deepEqual((await goalieBadge())?.earnedTiers, ["bronze", "silver", "platinum", "emerald"]);
    assert.equal((await goalieBadge())?.name, "Locked In");
    assert.deepEqual((await goalieBadge())?.tiers.map((tier) => [tier.tier, tier.threshold, tier.imagePath]),
      LOCKED_IN_TIERS.map((tier) => [tier.tier, tier.threshold, tier.imagePath]));
    const preview = (await getTrophyCasePreview()).sections.flatMap((section) => section.badges)
      .find((badge) => badge.slug === "broom");
    assert.deepEqual(preview?.tiers.map((tier) => tier.imagePath),
      LOCKED_IN_TIERS.map((tier) => tier.imagePath));
    const events = (await getPendingBadgeEvents(goalieId))
      .filter((event) => event.definition.slug === "broom");
    assert.deepEqual(events.map((event) => (event.payload as any).tier).sort(),
      ["bronze", "emerald", "platinum", "silver"]);
    for (const event of events) {
      const payload = event.payload as Record<string, unknown>;
      assert.equal(payload.imagePath,
        LOCKED_IN_TIERS.find((tier) => tier.tier === payload.tier)?.imagePath);
    }
    const pendingBefore = events.length;
    await reconcileCareerShutouts();
    assert.equal((await getPendingBadgeEvents(goalieId))
      .filter((event) => event.definition.slug === "broom").length, pendingBefore);
  } finally {
    await db.execute(sql`DELETE FROM game_goalies WHERE game_id IN (SELECT id FROM games WHERE league_id = ${leagueId})`);
    await db.execute(sql`DELETE FROM games WHERE league_id = ${leagueId}`);
    await db.execute(sql`DELETE FROM league_memberships WHERE league_id = ${leagueId}`);
    await db.execute(sql`DELETE FROM teams WHERE league_id = ${leagueId}`);
    await db.execute(sql`DELETE FROM seasons WHERE league_id = ${leagueId}`);
    await db.execute(sql`DELETE FROM leagues WHERE id = ${leagueId}`);
    await db.execute(sql`DELETE FROM users WHERE id IN (${goalieId}, ${skaterId})`);
  }
});