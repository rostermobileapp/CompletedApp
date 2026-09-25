import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../db.js";
import { ensureBadgeTables } from "../badgeDbInit.js";
import {
  evaluateBadgesForUser, getPendingBadgeEvents, getSeasonRsvpKingStatus,
  getTrophyCase, getTrophyCasePreview, reconcileSeasonRsvpKing,
} from "../badges.js";

test("RSVP King awards each completed perfect Yes/No season, not missing responses or scrimmages", async () => {
  const run = randomUUID().replace(/-/g, "");
  const leagueId = `test_${run}_league`;
  const oldSeason = `test_${run}_old`;
  const newSeason = `test_${run}_new`;
  const teamId = `test_${run}_team`;
  const awayTeam = `test_${run}_away`;
  const [complete, partial, substitute, scrimmageOnly] =
    ["complete", "partial", "sub", "scrim"].map((name) => `test_${run}_${name}`);
  const [first, second, scrimmage, third, fourth] =
    ["first", "second", "scrimmage", "third", "fourth"].map((name) => `test_${run}_${name}`);
  const awards = async (userId: string) => (await db.execute(sql`
    SELECT a.scope_key, d.image_path FROM badge_awards a
      JOIN badge_definitions d ON d.id = a.badge_definition_id
    WHERE a.user_id = ${userId} AND d.slug = 'rsvp_king'
    ORDER BY a.scope_key
  `)).rows;
  const events = async (userId: string) => (await db.execute(sql`
    SELECT e.payload FROM badge_earned_events e JOIN badge_definitions d ON d.id = e.badge_definition_id
    WHERE e.user_id = ${userId} AND d.slug = 'rsvp_king'
  `)).rows;

  try {
    await ensureBadgeTables();
    for (const userId of [complete, partial, substitute, scrimmageOnly]) {
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
      VALUES (${leagueId}, 'RSVP King Test', ${`L${run.slice(0, 5)}`.toUpperCase()},
        'hockey', ${complete}, true, false, 'captain_and_commissioner', 'America/New_York', NOW(), NOW())
    `);
    await db.execute(sql`
      INSERT INTO seasons (id, name, league_id, is_active, created_at, updated_at)
      VALUES (${oldSeason}, 'Old', ${leagueId}, false, NOW(), NOW()),
        (${newSeason}, 'New', ${leagueId}, true, NOW(), NOW())
    `);
    await db.execute(sql`
      INSERT INTO teams (id, name, league_id, season_id, created_at, updated_at)
      VALUES (${teamId}, 'Home', ${leagueId}, ${oldSeason}, NOW(), NOW()),
        (${awayTeam}, 'Away', ${leagueId}, ${oldSeason}, NOW(), NOW())
    `);
    for (const userId of [complete, partial]) {
      await db.execute(sql`
        INSERT INTO team_memberships (team_id, user_id, status, joined_at)
        VALUES (${teamId}, ${userId}, 'approved', '2024-01-01 12:00:00')
      `);
    }
    await db.execute(sql`
      INSERT INTO games (id, league_id, season_id, home_team_id, scheduled_at, is_scrimmage)
      VALUES (${first}, ${leagueId}, ${oldSeason}, ${teamId}, '2025-01-01 12:00', false),
        (${second}, ${leagueId}, ${oldSeason}, ${teamId}, '2025-01-08 12:00', false),
        (${scrimmage}, ${leagueId}, ${oldSeason}, ${teamId}, '2025-01-15 12:00', true),
        (${third}, ${leagueId}, ${newSeason}, ${teamId}, '2026-01-01 12:00', false),
        (${fourth}, ${leagueId}, ${newSeason}, ${teamId}, '2026-01-08 12:00', false)
    `);
    await db.execute(sql`
      INSERT INTO game_rsvps (game_id, team_id, user_id, status)
      VALUES (${first}, ${teamId}, ${complete}, 'attending'),
        (${second}, ${teamId}, ${complete}, 'not_attending'),
        (${first}, ${teamId}, ${partial}, 'attending'),
        (${second}, ${teamId}, ${partial}, 'no_response'),
        (${first}, ${teamId}, ${substitute}, 'not_attending'),
        (${second}, ${teamId}, ${substitute}, 'attending'),
        (${scrimmage}, ${teamId}, ${scrimmageOnly}, 'attending'),
        (${third}, ${teamId}, ${complete}, 'not_attending'),
        (${fourth}, ${teamId}, ${complete}, 'attending'),
        (${third}, ${teamId}, ${partial}, 'attending')
    `);
    assert.deepEqual(await getSeasonRsvpKingStatus(complete, oldSeason),
      { total: 2, responded: 2, qualified: true });
    assert.deepEqual(await getSeasonRsvpKingStatus(partial, oldSeason),
      { total: 2, responded: 1, qualified: false });
    assert.equal(await reconcileSeasonRsvpKing(), 2); // Old season, silently.
    assert.equal((await events(complete)).length, 0);
    assert.equal((await awards(substitute)).length, 1); // Explicit substitute RSVPs count.
    assert.equal((await awards(partial)).length, 0);
    assert.equal((await awards(scrimmageOnly)).length, 0);
    await evaluateBadgesForUser(complete, { seasonId: newSeason }, "season_rsvp_perfect");
    assert.equal((await awards(complete)).length, 1); // Active season is not final.

    await db.execute(sql`UPDATE seasons SET is_active = false WHERE id = ${newSeason}`);
    await evaluateBadgesForUser(complete, { seasonId: newSeason }, "season_rsvp_perfect");
    await evaluateBadgesForUser(complete, { seasonId: newSeason }, "season_rsvp_perfect");
    assert.deepEqual((await awards(complete)).map((row) => row.scope_key),
      [`season:${newSeason}`, `season:${oldSeason}`].sort());
    assert.equal((await events(complete)).length, 1);
    assert.equal(((await events(complete))[0].payload as { imagePath: string }).imagePath,
      "/badges/rsvp-king/patch.webp");
    assert.equal(await reconcileSeasonRsvpKing(true, newSeason), 0);
    assert.equal((await awards(partial)).length, 0);
    const badge = (await getTrophyCase(complete)).sections.flatMap((section) => section.badges)
      .find((item) => item.slug === "rsvp_king");
    assert.equal(badge?.isEarned, true);
    assert.equal(badge?.count, 2);
    assert.equal(badge?.imagePath, "/badges/rsvp-king/patch.webp");
    assert.equal((await getTrophyCasePreview()).sections.flatMap((section) => section.badges)
      .find((item) => item.slug === "rsvp_king")?.imagePath, "/badges/rsvp-king/patch.webp");
    assert.equal((await getPendingBadgeEvents(complete))
      .filter((event) => event.definition.slug === "rsvp_king").length, 1);
  } finally {
    await db.execute(sql`DELETE FROM game_rsvps WHERE game_id IN (${first}, ${second}, ${scrimmage}, ${third}, ${fourth})`);
    await db.execute(sql`DELETE FROM games WHERE league_id = ${leagueId}`);
    await db.execute(sql`DELETE FROM team_memberships WHERE team_id IN (${teamId}, ${awayTeam})`);
    await db.execute(sql`DELETE FROM teams WHERE league_id = ${leagueId}`);
    await db.execute(sql`DELETE FROM seasons WHERE league_id = ${leagueId}`);
    await db.execute(sql`DELETE FROM leagues WHERE id = ${leagueId}`);
    for (const userId of [complete, partial, substitute, scrimmageOnly]) {
      await db.execute(sql`DELETE FROM users WHERE id = ${userId}`);
    }
  }
});