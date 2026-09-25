import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../db.js";
import { ensureDefaultBadges, evaluateBadgesForUser, getPendingBadgeEvents, reconcileRookieCard } from "../badges.js";

test("Rookie Card awards completed-game participants once, not RSVP-only players, and backfills silently", async () => {
  const run = randomUUID().replace(/-/g, "");
  const ids = Object.fromEntries(["skater", "goalie", "attendee", "rsvp", "historical"]
    .map((role) => [role, `test_${run}_${role}`])) as Record<string, string>;
  const leagueId = `test_${run}_league`;
  const seasonId = `test_${run}_season`;
  const teamId = `test_${run}_team`;
  const gameId = `test_${run}_game`;
  const historicalGameId = `test_${run}_historical_game`;
  const events = async (userId: string) =>
    (await getPendingBadgeEvents(userId)).filter((event) => event.definition.slug === "rookie_card");
  const awards = async (userId: string) => db.execute(sql`
    SELECT ba.scope_key, bd.image_path FROM badge_awards ba
    JOIN badge_definitions bd ON bd.id = ba.badge_definition_id
    WHERE ba.user_id = ${userId} AND bd.slug = 'rookie_card'
  `);

  try {
    await ensureDefaultBadges();
    for (const [role, id] of Object.entries(ids)) {
      await db.execute(sql`
        INSERT INTO users (id, email, first_name, last_name, role, onboarding_completed,
          last_updated, created_at, updated_at, fee_exempt)
        VALUES (${id}, ${`rookie_${role}_${run}@example.com`}, ${role}, 'Tester',
          'free_tier', false, NOW(), NOW(), NOW(), false)
      `);
    }
    await db.execute(sql`
      INSERT INTO leagues (id, name, unique_league_id, sport, commissioner_id, is_active,
        playoff_started, sub_approval_workflow, created_at, updated_at)
      VALUES (${leagueId}, 'Rookie Test', ${`R${run.slice(0, 5)}`.toUpperCase()},
        'hockey', ${ids.skater}, true, false, 'captain_and_commissioner', NOW(), NOW())
    `);
    await db.execute(sql`INSERT INTO seasons (id, name, league_id, is_active, created_at, updated_at)
      VALUES (${seasonId}, 'Current', ${leagueId}, true, NOW(), NOW())`);
    await db.execute(sql`INSERT INTO teams (id, name, league_id, season_id, created_at, updated_at)
      VALUES (${teamId}, 'Test Team', ${leagueId}, ${seasonId}, NOW(), NOW())`);
    await db.execute(sql`
      INSERT INTO games (id, league_id, season_id, home_team_id, scheduled_at, is_completed)
      VALUES (${gameId}, ${leagueId}, ${seasonId}, ${teamId}, '2026-01-02 12:00:00', false),
        (${historicalGameId}, ${leagueId}, ${seasonId}, ${teamId}, '2025-01-02 12:00:00', true)
    `);
    await db.execute(sql`INSERT INTO game_rsvps (game_id, team_id, user_id, status)
      VALUES (${gameId}, ${teamId}, ${ids.rsvp}, 'attending')`);
    await db.execute(sql`INSERT INTO game_attendance (game_id, team_id, user_id)
      VALUES (${gameId}, ${teamId}, ${ids.attendee}),
        (${historicalGameId}, ${teamId}, ${ids.historical})`);
    await db.execute(sql`INSERT INTO game_goalies (game_id, team_id, goalie_user_id)
      VALUES (${gameId}, ${teamId}, ${ids.goalie})`);
    await db.execute(sql`INSERT INTO game_goals (game_id, team_id, scorer_id, goal_number)
      VALUES (${gameId}, ${teamId}, ${ids.skater}, 1)`);

    for (const role of ["skater", "goalie", "attendee", "rsvp"]) {
      const id = ids[role];
      await evaluateBadgesForUser(id, undefined, "first_game_logged");
      assert.equal((await awards(id)).rows.length, 0, "uncompleted games and RSVPs must not award");
    }
    await reconcileRookieCard();
    assert.equal((await awards(ids.historical)).rows.length, 1);
    assert.equal((await events(ids.historical)).length, 0);

    await db.execute(sql`UPDATE games SET is_completed = true WHERE id = ${gameId}`);
    for (const role of ["skater", "goalie", "attendee"]) {
      const id = ids[role];
      await evaluateBadgesForUser(id, undefined, "first_game_logged");
      await evaluateBadgesForUser(id, undefined, "first_game_logged");
      assert.equal((await awards(id)).rows.length, 1);
      assert.equal((await awards(id)).rows[0].scope_key, "global");
      assert.equal((await awards(id)).rows[0].image_path, "/badges/rookie-card/patch.webp");
      const earned = await events(id);
      assert.equal(earned.length, 1);
      assert.equal((earned[0].payload as Record<string, unknown>).imagePath, "/badges/rookie-card/patch.webp");
    }
    await evaluateBadgesForUser(ids.rsvp, undefined, "first_game_logged");
    assert.equal((await awards(ids.rsvp)).rows.length, 0);
    await reconcileRookieCard();
    assert.equal((await events(ids.historical)).length, 0);
    for (const role of ["skater", "goalie", "attendee"]) assert.equal((await events(ids[role])).length, 1);
  } finally {
    await db.execute(sql`DELETE FROM games WHERE league_id = ${leagueId}`);
    await db.execute(sql`DELETE FROM teams WHERE league_id = ${leagueId}`);
    await db.execute(sql`DELETE FROM seasons WHERE league_id = ${leagueId}`);
    await db.execute(sql`DELETE FROM leagues WHERE id = ${leagueId}`);
    for (const id of Object.values(ids)) await db.execute(sql`DELETE FROM users WHERE id = ${id}`);
  }
});