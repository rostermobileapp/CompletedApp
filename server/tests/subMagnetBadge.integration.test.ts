import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../db.js";
import { ensureBadgeTables } from "../badgeDbInit.js";
import { getTrophyCase, reconcileSeasonSubMagnet } from "../badges.js";

test("Sub Magnet awards tied season No RSVP leaders, not active-season leaders or scrimmage RSVPs", async () => {
  const run = randomUUID().replace(/-/g, "");
  const leagueId = `test_${run}_league`;
  const otherLeagueId = `test_${run}_other_league`;
  const seasonId = `test_${run}_season`;
  const oldSeasonId = `test_${run}_old`;
  const otherSeasonId = `test_${run}_other`;
  const teamId = `test_${run}_team`;
  const awayTeamId = `test_${run}_away`;
  const otherTeamId = `test_${run}_other_team`;
  const userIds = ["a", "b", "c", "d"].map((role) => `test_${run}_${role}`);
  const [a, b, c, d] = userIds;
  const [first, second, scrimmage, historical, other] =
    ["first", "second", "scrimmage", "historical", "other"].map((name) => `test_${run}_${name}`);

  const awards = async (userId: string) => (await db.execute(sql`
    SELECT a.season_id, a.scope_key, a.metadata, d.image_path
    FROM badge_awards a JOIN badge_definitions d ON d.id = a.badge_definition_id
    WHERE d.slug = 'sub_magnet' AND a.user_id = ${userId}
    ORDER BY a.season_id
  `)).rows;
  const events = async (userId: string) => (await db.execute(sql`
    SELECT e.payload FROM badge_earned_events e
    JOIN badge_definitions d ON d.id = e.badge_definition_id
    WHERE d.slug = 'sub_magnet' AND e.user_id = ${userId}
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
      VALUES (${leagueId}, 'Sub Magnet Test', ${`L${run.slice(0, 5)}`.toUpperCase()},
        'hockey', ${d}, true, false, 'captain_and_commissioner', 'America/New_York', NOW(), NOW()),
        (${otherLeagueId}, 'Other League', ${`L${run.slice(5, 10)}`.toUpperCase()},
        'hockey', ${d}, true, false, 'captain_and_commissioner', 'America/New_York', NOW(), NOW())
    `);
    await db.execute(sql`
      INSERT INTO seasons (id, name, league_id, is_active, created_at, updated_at)
      VALUES (${seasonId}, 'Active', ${leagueId}, true, NOW(), NOW()),
        (${oldSeasonId}, 'Historical', ${leagueId}, false, NOW(), NOW()),
        (${otherSeasonId}, 'Other', ${otherLeagueId}, true, NOW(), NOW())
    `);
    await db.execute(sql`
      INSERT INTO teams (id, name, league_id, season_id, created_at, updated_at)
      VALUES (${teamId}, 'Home', ${leagueId}, ${seasonId}, NOW(), NOW()),
        (${awayTeamId}, 'Away', ${leagueId}, ${seasonId}, NOW(), NOW()),
        (${otherTeamId}, 'Other', ${otherLeagueId}, ${otherSeasonId}, NOW(), NOW())
    `);
    await db.execute(sql`
      INSERT INTO games (id, league_id, season_id, home_team_id, scheduled_at, is_scrimmage)
      VALUES (${first}, ${leagueId}, ${seasonId}, ${teamId}, '2025-02-01 12:00', false),
        (${second}, ${leagueId}, ${seasonId}, ${teamId}, '2025-02-08 12:00', false),
        (${scrimmage}, ${leagueId}, ${seasonId}, ${teamId}, '2025-02-15 12:00', true),
        (${historical}, ${leagueId}, ${oldSeasonId}, ${teamId}, '2024-02-01 12:00', false),
        (${other}, ${otherLeagueId}, ${otherSeasonId}, ${otherTeamId}, '2025-02-01 12:00', false)
    `);
    await db.execute(sql`
      INSERT INTO game_rsvps (game_id, team_id, user_id, status)
      VALUES (${first}, ${teamId}, ${a}, 'not_attending'),
        (${first}, ${teamId}, ${b}, 'not_attending'),
        (${first}, ${awayTeamId}, ${b}, 'not_attending'),
        (${first}, ${teamId}, ${c}, 'not_attending'),
        (${second}, ${teamId}, ${a}, 'not_attending'),
        (${second}, ${teamId}, ${b}, 'not_attending'),
        (${second}, ${teamId}, ${d}, 'attending'),
        (${scrimmage}, ${teamId}, ${c}, 'not_attending'),
        (${historical}, ${teamId}, ${c}, 'not_attending'),
        (${other}, ${otherTeamId}, ${c}, 'not_attending')
    `);
    // Historical winners appear without replaying an old announcement.
    assert.equal(await reconcileSeasonSubMagnet(), 1);
    assert.equal((await awards(c)).length, 1);
    assert.equal((await events(c)).length, 0);
    assert.equal((await awards(a)).length, 0);
    assert.equal(await reconcileSeasonSubMagnet(true, seasonId), 0);

    await db.execute(sql`UPDATE seasons SET is_active = false WHERE id = ${seasonId}`);
    assert.equal(await reconcileSeasonSubMagnet(true, seasonId), 2);
    assert.equal(await reconcileSeasonSubMagnet(true, seasonId), 0);
    for (const userId of [a, b]) {
      const won = await awards(userId);
      assert.equal(won.length, 1);
      assert.equal(won[0].scope_key, `season:${seasonId}`);
      assert.equal((won[0].metadata as { noRsvps: number }).noRsvps, 2);
      assert.equal(won[0].image_path, "/badges/sub-magnet/patch.webp");
      assert.equal((await events(userId)).length, 1);
      assert.equal((await getTrophyCase(userId)).sections.flatMap((section) => section.badges)
        .find((badge) => badge.slug === "sub_magnet")?.isEarned, true);
    }
    assert.equal((await awards(c)).length, 1); // Her old-season win does not affect the new one.
    assert.equal((await awards(d)).length, 0);
  } finally {
    await db.execute(sql`DELETE FROM game_rsvps WHERE game_id IN (${first}, ${second}, ${scrimmage}, ${historical}, ${other})`);
    await db.execute(sql`DELETE FROM games WHERE id IN (${first}, ${second}, ${scrimmage}, ${historical}, ${other})`);
    await db.execute(sql`DELETE FROM teams WHERE id IN (${teamId}, ${awayTeamId}, ${otherTeamId})`);
    await db.execute(sql`DELETE FROM seasons WHERE id IN (${seasonId}, ${oldSeasonId}, ${otherSeasonId})`);
    await db.execute(sql`DELETE FROM leagues WHERE id IN (${leagueId}, ${otherLeagueId})`);
    for (const userId of userIds) await db.execute(sql`DELETE FROM users WHERE id = ${userId}`);
  }
});