import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../db.js";
import {
  ensureDefaultBadges, evaluateBadgesForUser, getCurrentIronManStreak,
  getPendingBadgeEvents, getTrophyCase, reconcileIronMan,
} from "../badges.js";
import { IRON_MAN_TIERS } from "../../shared/ironManTiers.js";

test("Iron Man follows game attendance across seasons, resets on misses, and keeps earned tiers", async () => {
  const run = randomUUID().replace(/-/g, "");
  const userId = `test_${run}_player`;
  const leagueId = `test_${run}_league`;
  const seasonA = `test_${run}_season_a`;
  const seasonB = `test_${run}_season_b`;
  const teamId = `test_${run}_team`;
  const addGame = async (suffix: string, seasonId: string, date: string, attended: boolean, scrimmage = false) => {
    const gameId = `test_${run}_${suffix}`;
    await db.execute(sql`
      INSERT INTO games (id, league_id, season_id, home_team_id, scheduled_at, is_completed, is_scrimmage)
      VALUES (${gameId}, ${leagueId}, ${seasonId}, ${teamId}, ${date}, true, ${scrimmage})
    `);
    if (attended) await db.execute(sql`
      INSERT INTO game_attendance (game_id, team_id, user_id) VALUES (${gameId}, ${teamId}, ${userId})
    `);
    return gameId;
  };
  const badge = async () => (await getTrophyCase(userId)).sections
    .flatMap((section) => section.badges).find((item) => item.slug === "iron_man");

  try {
    await ensureDefaultBadges();
    await db.execute(sql`
      INSERT INTO users (id, email, first_name, last_name, role, onboarding_completed,
        last_updated, created_at, updated_at, fee_exempt)
      VALUES (${userId}, ${`iron_${run}@example.com`}, 'Iron', 'Tester',
        'free_tier', false, NOW(), NOW(), NOW(), false)
    `);
    await db.execute(sql`
      INSERT INTO leagues (id, name, unique_league_id, sport, commissioner_id, is_active,
        playoff_started, sub_approval_workflow, created_at, updated_at)
      VALUES (${leagueId}, 'Iron Man Test', ${`I${run.slice(0, 5)}`.toUpperCase()},
        'hockey', ${userId}, true, false, 'captain_and_commissioner', NOW(), NOW())
    `);
    await db.execute(sql`
      INSERT INTO seasons (id, name, league_id, is_active, start_date, created_at, updated_at)
      VALUES (${seasonA}, 'Winter', ${leagueId}, false, '2025-12-01', NOW(), NOW()),
        (${seasonB}, 'Spring', ${leagueId}, true, '2026-01-01', NOW(), NOW())
    `);
    await db.execute(sql`
      INSERT INTO teams (id, name, league_id, season_id, created_at, updated_at)
      VALUES (${teamId}, 'Iron Team', ${leagueId}, ${seasonA}, NOW(), NOW())
    `);
    await db.execute(sql`
      INSERT INTO team_memberships (user_id, team_id, status, joined_at)
      VALUES (${userId}, ${teamId}, 'approved', '2025-01-01 00:00:00')
    `);
    for (let i = 0; i < 5; i++) {
      const season = i < 3 ? seasonA : seasonB;
      const date = new Date(Date.UTC(2025, 11, 27 + i)).toISOString().slice(0, 10);
      await addGame(`first${i}`, season, `${date} 12:00:00`, true);
    }
    assert.deepEqual(IRON_MAN_TIERS.map((tier) => tier.threshold), [5, 10, 15, 25]);
    assert.equal(await getCurrentIronManStreak(userId), 5);
    await evaluateBadgesForUser(userId, undefined, "consecutive_games_played");
    assert.deepEqual((await badge())?.earnedTiers, ["bronze"]);
    assert.deepEqual((await badge())?.tiers.map((tier) => tier.imagePath),
      IRON_MAN_TIERS.map((tier) => tier.imagePath));

    // A missed scrimmage doesn't count. A missed game does, even across a year boundary.
    await addGame("scrimmage", seasonB, "2026-01-01 12:00:00", false, true);
    assert.equal(await getCurrentIronManStreak(userId), 5);
    await addGame("miss", seasonB, "2026-01-02 12:00:00", false);
    assert.equal(await getCurrentIronManStreak(userId), 0);
    await evaluateBadgesForUser(userId, undefined, "consecutive_games_played");
    assert.equal((await badge())?.currentProgress, 0);
    assert.deepEqual((await badge())?.earnedTiers, ["bronze"]);

    for (let i = 0; i < 25; i++) {
      const date = new Date(Date.UTC(2026, 0, 3 + i)).toISOString().slice(0, 10);
      await addGame(`return${i}`, seasonB, `${date} 12:00:00`, true);
    }
    assert.equal(await getCurrentIronManStreak(userId), 25);
    await evaluateBadgesForUser(userId, undefined, "consecutive_games_played");
    assert.equal((await badge())?.currentProgress, 25);
    assert.deepEqual((await badge())?.earnedTiers, ["bronze", "silver", "gold", "platinum"]);
    const events = (await getPendingBadgeEvents(userId)).filter((event) => event.definition.slug === "iron_man");
    assert.deepEqual(events.map((event) => (event.payload as any).tier).sort(),
      ["bronze", "gold", "platinum", "silver"]);
    for (const event of events) {
      const payload = event.payload as Record<string, unknown>;
      assert.equal(payload.imagePath, IRON_MAN_TIERS.find((tier) => tier.tier === payload.tier)?.imagePath);
    }

    await addGame("lastmiss", seasonB, "2026-02-01 12:00:00", false);
    await evaluateBadgesForUser(userId, undefined, "consecutive_games_played");
    assert.equal((await badge())?.currentProgress, 0);
    assert.deepEqual((await badge())?.earnedTiers, ["bronze", "silver", "gold", "platinum"]);
    const before = (await getPendingBadgeEvents(userId)).filter((event) => event.definition.slug === "iron_man").length;
    await reconcileIronMan();
    assert.equal((await getPendingBadgeEvents(userId)).filter((event) => event.definition.slug === "iron_man").length, before);
    assert.deepEqual((await badge())?.earnedTiers, ["bronze", "silver", "gold", "platinum"]);

    // League-assigned players are also due at their team's games.
    await db.execute(sql`DELETE FROM team_memberships WHERE team_id = ${teamId}`);
    await db.execute(sql`
      INSERT INTO league_memberships (user_id, league_id, assigned_team_id, status, requested_at)
      VALUES (${userId}, ${leagueId}, ${teamId}, 'approved', '2025-01-01 00:00:00')
    `);
    await addGame("leagueplayed", seasonB, "2026-02-02 12:00:00", true);
    assert.equal(await getCurrentIronManStreak(userId), 1);
    await addGame("leaguemissed", seasonB, "2026-02-03 12:00:00", false);
    assert.equal(await getCurrentIronManStreak(userId), 0);
  } finally {
    await db.execute(sql`DELETE FROM games WHERE league_id = ${leagueId}`);
    await db.execute(sql`DELETE FROM team_memberships WHERE team_id = ${teamId}`);
    await db.execute(sql`DELETE FROM league_memberships WHERE league_id = ${leagueId}`);
    await db.execute(sql`DELETE FROM teams WHERE league_id = ${leagueId}`);
    await db.execute(sql`DELETE FROM seasons WHERE league_id = ${leagueId}`);
    await db.execute(sql`DELETE FROM leagues WHERE id = ${leagueId}`);
    await db.execute(sql`DELETE FROM users WHERE id = ${userId}`);
  }
});