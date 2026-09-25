import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../db.js";
import { ensureBadgeTables } from "../badgeDbInit.js";
import {
  evaluateBadgesForUser, getPendingBadgeEvents, getSeasonEarlyBirdStatus,
  getTrophyCase, getTrophyCasePreview, reconcileSeasonEarlyBird,
} from "../badges.js";

test("Early Bird requires every eligible RSVP 48 hours early and starts over each season", async () => {
  const run = randomUUID().replace(/-/g, "");
  const userId = `test_${run}_player`;
  const leagueId = `test_${run}_league`;
  const oldSeason = `test_${run}_old`;
  const newSeason = `test_${run}_new`;
  const teamId = `test_${run}_team`;
  const first = `test_${run}_first`;
  const second = `test_${run}_second`;
  const next = `test_${run}_next`;
  const badge = async (seasonId: string) => (await getTrophyCase(userId, seasonId)).sections
    .flatMap((section) => section.badges).find((item) => item.slug === "early_bird");
  try {
    await ensureBadgeTables();
    await db.execute(sql`
      INSERT INTO users (id, email, first_name, last_name, role, onboarding_completed,
        last_updated, created_at, updated_at, fee_exempt)
      VALUES (${userId}, ${`early_${run}@example.com`}, 'Early', 'Tester',
        'free_tier', false, NOW(), NOW(), NOW(), false)
    `);
    await db.execute(sql`
      INSERT INTO leagues (id, name, unique_league_id, sport, commissioner_id, is_active,
        playoff_started, sub_approval_workflow, timezone, created_at, updated_at)
      VALUES (${leagueId}, 'Early Bird Test', ${`L${run.slice(0, 5)}`.toUpperCase()},
        'hockey', ${userId}, true, false, 'captain_and_commissioner', 'America/New_York', NOW(), NOW())
    `);
    await db.execute(sql`
      INSERT INTO seasons (id, name, league_id, is_active, start_date, created_at, updated_at)
      VALUES (${oldSeason}, 'Old Season', ${leagueId}, false, '2025-01-01', NOW(), NOW()),
        (${newSeason}, 'New Season', ${leagueId}, true, '2026-01-01', NOW(), NOW())
    `);
    await db.execute(sql`
      INSERT INTO teams (id, name, league_id, season_id, created_at, updated_at)
      VALUES (${teamId}, 'Early Team', ${leagueId}, ${oldSeason}, NOW(), NOW())
    `);
    await db.execute(sql`
      INSERT INTO team_memberships (user_id, team_id, status, joined_at)
      VALUES (${userId}, ${teamId}, 'approved', '2024-12-01')
    `);
    await db.execute(sql`
      INSERT INTO games (id, league_id, season_id, home_team_id, scheduled_at, is_completed)
      VALUES (${first}, ${leagueId}, ${oldSeason}, ${teamId}, '2025-01-03 12:00:00', true),
        (${second}, ${leagueId}, ${oldSeason}, ${teamId}, '2025-01-10 12:00:00', true),
        (${next}, ${leagueId}, ${newSeason}, ${teamId}, '2026-01-03 12:00:00', true)
    `);
    await db.execute(sql`
      INSERT INTO game_rsvps (game_id, team_id, user_id, status, created_at, updated_at)
      VALUES (${first}, ${teamId}, ${userId}, 'attending', '2024-12-30 10:00:00', '2024-12-30 10:00:00')
    `);
    assert.deepEqual(await getSeasonEarlyBirdStatus(userId, oldSeason),
      { total: 2, early: 1, qualified: false });
    await evaluateBadgesForUser(userId, { seasonId: oldSeason }, "season_48hr_rsvp_perfect");
    assert.equal((await badge(oldSeason))?.isEarned, false);

    // Late RSVP does not qualify, even though both games have an attending response.
    await db.execute(sql`
      INSERT INTO game_rsvps (game_id, team_id, user_id, status, created_at, updated_at)
      VALUES (${second}, ${teamId}, ${userId}, 'attending', '2025-01-09 10:00:00', '2025-01-09 10:00:00')
    `);
    await evaluateBadgesForUser(userId, { seasonId: oldSeason }, "season_48hr_rsvp_perfect");
    assert.equal((await badge(oldSeason))?.isEarned, false);
    await db.execute(sql`
      UPDATE game_rsvps SET updated_at = '2025-01-06 10:00:00'
      WHERE game_id = ${second} AND user_id = ${userId}
    `);
    await evaluateBadgesForUser(userId, { seasonId: oldSeason }, "season_48hr_rsvp_perfect");
    assert.equal((await badge(oldSeason))?.isEarned, true);
    assert.equal((await badge(oldSeason))?.imagePath, "/badges/early-bird/patch.webp");
    const firstEvent = (await getPendingBadgeEvents(userId))
      .filter((event) => event.definition.slug === "early_bird");
    assert.equal(firstEvent.length, 1);
    assert.equal((firstEvent[0].payload as any).seasonId, oldSeason);
    assert.equal((firstEvent[0].payload as any).imagePath, "/badges/early-bird/patch.webp");

    await db.execute(sql`
      INSERT INTO game_rsvps (game_id, team_id, user_id, status, created_at, updated_at)
      VALUES (${next}, ${teamId}, ${userId}, 'attending', '2025-12-29 10:00:00', '2025-12-29 10:00:00')
    `);
    assert.equal((await badge(newSeason))?.isEarned, false);
    await evaluateBadgesForUser(userId, { seasonId: newSeason }, "season_48hr_rsvp_perfect");
    assert.equal((await badge(newSeason))?.isEarned, false); // Season is still active.
    await db.execute(sql`UPDATE seasons SET is_active = false WHERE id = ${newSeason}`);
    await evaluateBadgesForUser(userId, { seasonId: newSeason }, "season_48hr_rsvp_perfect");
    assert.equal((await badge(newSeason))?.isEarned, true);
    assert.equal((await badge(oldSeason))?.isEarned, true);
    const awards = await db.execute(sql`
      SELECT scope_key FROM badge_awards a JOIN badge_definitions d ON d.id = a.badge_definition_id
      WHERE a.user_id = ${userId} AND d.slug = 'early_bird' ORDER BY scope_key
    `);
    assert.deepEqual(awards.rows.map((row) => row.scope_key),
      [`season:${newSeason}`, `season:${oldSeason}`].sort());
    assert.equal((await getTrophyCasePreview()).sections.flatMap((section) => section.badges)
      .find((item) => item.slug === "early_bird")?.imagePath, "/badges/early-bird/patch.webp");
    const before = (await getPendingBadgeEvents(userId)).length;
    await reconcileSeasonEarlyBird();
    assert.equal((await getPendingBadgeEvents(userId)).length, before);
  } finally {
    await db.execute(sql`DELETE FROM game_rsvps WHERE game_id IN (${first}, ${second}, ${next})`);
    await db.execute(sql`DELETE FROM games WHERE league_id = ${leagueId}`);
    await db.execute(sql`DELETE FROM team_memberships WHERE team_id = ${teamId}`);
    await db.execute(sql`DELETE FROM teams WHERE league_id = ${leagueId}`);
    await db.execute(sql`DELETE FROM seasons WHERE league_id = ${leagueId}`);
    await db.execute(sql`DELETE FROM leagues WHERE id = ${leagueId}`);
    await db.execute(sql`DELETE FROM users WHERE id = ${userId}`);
  }
});