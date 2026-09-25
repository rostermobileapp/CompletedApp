import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../db.js";
import {
  currentCenturyClubYear, ensureDefaultBadges,
  getCalendarYearAppearances, getPendingBadgeEvents, getTrophyCase,
} from "../badges.js";
import { CENTURY_CLUB_TIERS } from "../../shared/centuryClubTiers.js";

test("Century Club counts current-year games and played scrimmages and uses the matching tier art", async () => {
  const run = randomUUID().replace(/-/g, "");
  const userId = `test_${run}_player`;
  const leagueId = `test_${run}_league`;
  const seasonId = `test_${run}_season`;
  const teamId = `test_${run}_team`;
  const year = currentCenturyClubYear();
  const gameIds = Array.from({ length: 9 }, (_, i) => `test_${run}_game_${i}`);
  const scrimIds = ["approved", "old", "pending", "cancelled", "future"].map(s => `test_${run}_${s}`);
  try {
    assert.equal(currentCenturyClubYear(new Date("2027-01-01T04:59:59Z")), 2026);
    assert.equal(currentCenturyClubYear(new Date("2027-01-01T05:00:00Z")), 2027);
    assert.deepEqual(CENTURY_CLUB_TIERS.map(t => t.threshold), [10, 25, 50, 100, 250]);
    await ensureDefaultBadges();
    await db.execute(sql`
      INSERT INTO users (id, email, first_name, last_name, role, onboarding_completed,
        last_updated, created_at, updated_at, fee_exempt)
      VALUES (${userId}, ${`century_${run}@example.com`}, 'Century', 'Tester',
        'free_tier', false, NOW(), NOW(), NOW(), false)
    `);
    await db.execute(sql`
      INSERT INTO leagues (id, name, unique_league_id, sport, commissioner_id, is_active,
        playoff_started, sub_approval_workflow, created_at, updated_at)
      VALUES (${leagueId}, 'Century Test', ${`C${run.slice(0, 5)}`.toUpperCase()},
        'hockey', ${userId}, true, false, 'captain_and_commissioner', NOW(), NOW())
    `);
    await db.execute(sql`INSERT INTO seasons (id, name, league_id, is_active, created_at, updated_at)
      VALUES (${seasonId}, 'Current', ${leagueId}, true, NOW(), NOW())`);
    await db.execute(sql`INSERT INTO teams (id, name, league_id, season_id, created_at, updated_at)
      VALUES (${teamId}, 'Test Team', ${leagueId}, ${seasonId}, NOW(), NOW())`);
    for (const gameId of gameIds) {
      await db.execute(sql`
        INSERT INTO games (id, league_id, season_id, home_team_id, scheduled_at, is_completed)
        VALUES (${gameId}, ${leagueId}, ${seasonId}, ${teamId}, ${`${year}-01-02 12:00:00`}, true)
      `);
      await db.execute(sql`
        INSERT INTO game_attendance (game_id, team_id, user_id, recorded_by)
        VALUES (${gameId}, ${teamId}, ${userId}, ${userId})
      `);
    }
    const dates = [
      `${year}-01-03 12:00:00`, `${year - 1}-12-31 12:00:00`,
      `${year}-01-04 12:00:00`, `${year}-01-05 12:00:00`,
      `${year}-12-31 12:00:00`,
    ];
    for (const [i, scrimId] of scrimIds.entries()) {
      await db.execute(sql`
        INSERT INTO scrimmages (id, league_id, creator_id, title, date_time, timezone,
          location, max_players, status)
        VALUES (${scrimId}, ${leagueId}, ${userId}, 'Century Test',
          ${dates[i]}, 'America/New_York', 'Test rink', 10,
          ${i === 3 ? "cancelled" : "roster_confirmed"}::scrimmage_status)
      `);
      await db.execute(sql`
        INSERT INTO scrimmage_requests (scrimmage_id, player_id, status)
        VALUES (${scrimId}, ${userId},
          ${i === 2 ? "pending" : "approved"}::scrimmage_request_status)
      `);
    }
    assert.equal(await getCalendarYearAppearances(userId, year), 10);
    assert.equal(await getCalendarYearAppearances(userId, year - 1), 1);
    const trophyBeforeAward = await getTrophyCase(userId);
    const centuryBeforeAward = trophyBeforeAward.sections.flatMap(s => s.badges)
      .find(b => b.slug === "century_club");
    assert.equal(centuryBeforeAward?.currentProgress, 10);
    assert.deepEqual(centuryBeforeAward?.earnedTiers, ["bronze"]);
    assert.deepEqual(centuryBeforeAward?.tiers.map(t => t.imagePath), CENTURY_CLUB_TIERS.map(t => t.imagePath));
    const pending = await getPendingBadgeEvents(userId);
    const bronze = pending.find(e => e.definition.slug === "century_club"
      && (e.payload as Record<string, unknown>).tier === "bronze");
    assert.equal((bronze?.payload as Record<string, unknown>)?.year, year);
    assert.equal((bronze?.payload as Record<string, unknown>)?.imagePath, CENTURY_CLUB_TIERS[0].imagePath);
    const trophyAfterAward = await getTrophyCase(userId);
    const centuryAfterAward = trophyAfterAward.sections.flatMap(s => s.badges)
      .find(b => b.slug === "century_club");
    assert.equal(centuryAfterAward?.awards[0]?.scopeKey, `year:${year}:tier:bronze`);
  } finally {
    await db.execute(sql`DELETE FROM scrimmage_requests WHERE scrimmage_id IN (SELECT id FROM scrimmages WHERE league_id = ${leagueId})`);
    await db.execute(sql`DELETE FROM scrimmages WHERE league_id = ${leagueId}`);
    await db.execute(sql`DELETE FROM games WHERE league_id = ${leagueId}`);
    await db.execute(sql`DELETE FROM teams WHERE league_id = ${leagueId}`);
    await db.execute(sql`DELETE FROM seasons WHERE league_id = ${leagueId}`);
    await db.execute(sql`DELETE FROM leagues WHERE id = ${leagueId}`);
    await db.execute(sql`DELETE FROM users WHERE id = ${userId}`);
  }
});