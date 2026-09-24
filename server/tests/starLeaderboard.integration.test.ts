import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { db } from '../db.js';
import { storage } from '../storage.js';
import { getCareerThreeStarPoints, getTrophyCase } from '../badges.js';

const run = randomUUID().replace(/-/g, '');
const commissionerId = `test_${run}_commissioner`;
const leagueId = `test_${run}_league`;
const currentSeasonId = `test_${run}_current_season`;
const previousSeasonId = `test_${run}_previous_season`;
const homeTeamId = `test_${run}_home_team`;
const awayTeamId = `test_${run}_away_team`;
const currentPlayerIds = Array.from(
  { length: 11 },
  (_, index) => `test_${run}_current_player_${index}`,
);
const previousPlayerId = `test_${run}_previous_player`;
const gameIds = [
  ...currentPlayerIds.map((_, index) => `test_${run}_current_game_${index}`),
  `test_${run}_previous_game`,
];

test('star leaderboards stay season-scoped and preserve capped and full-list requests', async () => {
  try {
    await db.execute(sql`
      INSERT INTO users
        (id, email, first_name, last_name, role, onboarding_completed,
         last_updated, created_at, updated_at, fee_exempt)
      VALUES
        (${commissionerId}, ${`commissioner_${run}@example.com`}, 'Test', 'Commissioner',
         'free_tier', false, NOW(), NOW(), NOW(), false)
    `);

    for (const [index, playerId] of [...currentPlayerIds, previousPlayerId].entries()) {
      await db.execute(sql`
        INSERT INTO users
          (id, email, first_name, last_name, role, onboarding_completed,
           last_updated, created_at, updated_at, fee_exempt)
        VALUES
          (${playerId}, ${`player_${run}_${index}@example.com`}, 'Test', ${`Player ${index}`},
           'free_tier', false, NOW(), NOW(), NOW(), false)
      `);
    }

    await db.execute(sql`
      INSERT INTO leagues
        (id, name, unique_league_id, sport, commissioner_id, is_active,
         playoff_started, sub_approval_workflow, created_at, updated_at)
      VALUES
        (${leagueId}, 'Star Leaderboard Test League', ${`Z${run.slice(0, 5)}`.toUpperCase()},
         'hockey', ${commissionerId}, true, false, 'captain_and_commissioner', NOW(), NOW())
    `);

    await db.execute(sql`
      INSERT INTO seasons (id, name, league_id, is_active, created_at, updated_at)
      VALUES
        (${currentSeasonId}, 'Current Star Season', ${leagueId}, true, NOW(), NOW()),
        (${previousSeasonId}, 'Previous Star Season', ${leagueId}, false, NOW(), NOW())
    `);

    await db.execute(sql`
      INSERT INTO teams (id, name, league_id, season_id, created_at, updated_at)
      VALUES
        (${homeTeamId}, 'Home Team', ${leagueId}, ${currentSeasonId}, NOW(), NOW()),
        (${awayTeamId}, 'Away Team', ${leagueId}, ${currentSeasonId}, NOW(), NOW())
    `);

    for (const [index, gameId] of gameIds.entries()) {
      const seasonId = index < currentPlayerIds.length ? currentSeasonId : previousSeasonId;
      await db.execute(sql`
        INSERT INTO games
          (id, league_id, season_id, home_team_id, away_team_id, scheduled_at,
           home_score, away_score, is_completed)
        VALUES
          (${gameId}, ${leagueId}, ${seasonId}, ${homeTeamId}, ${awayTeamId},
           NOW(), 3, 1, true)
      `);
    }

    for (const [index, gameId] of gameIds.slice(0, currentPlayerIds.length).entries()) {
      const firstStarUserId = currentPlayerIds[index];
      const secondStarUserId = currentPlayerIds[(index + 1) % currentPlayerIds.length];
      const thirdStarUserId = currentPlayerIds[(index + 2) % currentPlayerIds.length];
      await db.execute(sql`
        INSERT INTO game_stars
          (game_id, first_star_user_id, second_star_user_id, third_star_user_id, awarded_by)
        VALUES
          (${gameId}, ${firstStarUserId}, ${secondStarUserId}, ${thirdStarUserId}, ${commissionerId})
      `);
    }

    await db.execute(sql`
      INSERT INTO game_stars
        (game_id, first_star_user_id, second_star_user_id, third_star_user_id, awarded_by)
      VALUES
        (${gameIds.at(-1)}, ${previousPlayerId}, ${currentPlayerIds[0]},
         ${currentPlayerIds[1]}, ${commissionerId})
    `);

    const currentSeasonLeaderboard = await storage.getLeagueStarLeaderboard(
      leagueId,
      null,
      currentSeasonId,
    );
    assert.equal(currentSeasonLeaderboard.length, currentPlayerIds.length);
    assert.deepEqual(
      new Set(currentSeasonLeaderboard.map(entry => entry.user.id)),
      new Set(currentPlayerIds),
    );
    assert.ok(
      currentSeasonLeaderboard.every(entry => entry.user.id !== previousPlayerId),
      'a selected season must not include stars from another season',
    );

    const fullLeaderboard = await storage.getLeagueStarLeaderboard(leagueId, null);
    assert.equal(fullLeaderboard.length, currentPlayerIds.length + 1);
    assert.ok(fullLeaderboard.some(entry => entry.user.id === previousPlayerId));
    assert.equal(
      currentSeasonLeaderboard.find(entry => entry.user.id === currentPlayerIds[0])?.starPoints,
      6,
    );
    assert.equal(await getCareerThreeStarPoints(currentPlayerIds[0]), 8);
    assert.equal(await getCareerThreeStarPoints(previousPlayerId), 3);

    const caseData = await getTrophyCase(currentPlayerIds[0]);
    const threeStars = caseData.sections.flatMap(section => section.badges)
      .find(badge => badge.slug === 'three_stars');
    assert.equal(threeStars?.currentProgress, 8);
    assert.equal(threeStars?.isEarned, true);
    assert.ok(threeStars?.earnedTiers.includes('bronze'));
    assert.ok(!threeStars?.earnedTiers.includes('silver'));

    const defaultLeaderboard = await storage.getLeagueStarLeaderboard(leagueId);
    assert.equal(defaultLeaderboard.length, 10);
    assert.ok(
      defaultLeaderboard.every(entry => entry.starPoints > 0),
      'the default leaderboard should still return ranked players',
    );
  } finally {
    await db.execute(sql`
      DELETE FROM game_stars
      WHERE game_id IN (SELECT id FROM games WHERE league_id = ${leagueId})
    `);
    await db.execute(sql`DELETE FROM games WHERE league_id = ${leagueId}`);
    await db.execute(sql`DELETE FROM teams WHERE league_id = ${leagueId}`);
    await db.execute(sql`DELETE FROM seasons WHERE league_id = ${leagueId}`);
    await db.execute(sql`DELETE FROM leagues WHERE id = ${leagueId}`);
    await db.execute(sql`DELETE FROM users WHERE id = ${commissionerId}`);
    for (const playerId of [...currentPlayerIds, previousPlayerId]) {
      await db.execute(sql`DELETE FROM users WHERE id = ${playerId}`);
    }
  }
});