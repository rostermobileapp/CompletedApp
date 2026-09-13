import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { db } from '../db.js';
import { storage } from '../storage.js';

test('goalie stats include approved goalies with no completed games', async () => {
  const run = randomUUID().replace(/-/g, '');
  const commissionerId = `test_${run}_commissioner`;
  const goalieId = `test_${run}_goalie`;
  const leagueId = `test_${run}_league`;
  const membershipId = `test_${run}_membership`;
  const seasonId = `test_${run}_season`;
  const uniqueLeagueId = `Z${run.slice(0, 5)}`.toUpperCase();

  try {
    await db.execute(sql`
      INSERT INTO users
        (id, email, first_name, last_name, role, onboarding_completed,
         last_updated, created_at, updated_at, fee_exempt)
      VALUES
        (${commissionerId}, ${`commissioner_${run}@example.com`}, 'Test', 'Commissioner',
         'free_tier', false, NOW(), NOW(), NOW(), false),
        (${goalieId}, ${`goalie_${run}@example.com`}, 'Zero', 'Goalie',
         'free_tier', false, NOW(), NOW(), NOW(), false)
    `);

    await db.execute(sql`
      INSERT INTO leagues
        (id, name, unique_league_id, sport, commissioner_id, is_active,
         playoff_started, sub_approval_workflow, created_at, updated_at)
      VALUES
        (${leagueId}, 'Goalie Stats Test League', ${uniqueLeagueId}, 'hockey',
         ${commissionerId}, true, false, 'captain_and_commissioner', NOW(), NOW())
    `);

    await db.execute(sql`
      INSERT INTO seasons (id, name, league_id, is_active, created_at, updated_at)
      VALUES (${seasonId}, 'Goalie Stats Test Season', ${leagueId}, true, NOW(), NOW())
    `);

    await db.execute(sql`
      INSERT INTO league_memberships
        (id, user_id, league_id, status, requested_at, is_goalie, is_skater)
      VALUES
        (${membershipId}, ${goalieId}, ${leagueId}, 'approved', NOW(), true, false)
    `);

    const allSeasonStats = await storage.getGoalieStats(leagueId);
    assert.deepEqual(
      allSeasonStats.map(stat => ({
        userId: stat.userId,
        gamesPlayed: stat.gamesPlayed,
        wins: stat.wins,
        losses: stat.losses,
        ties: stat.ties,
        shootoutLosses: stat.shootoutLosses,
        goalsAgainst: stat.goalsAgainst,
        shutouts: stat.shutouts,
        goalsAgainstAverage: stat.goalsAgainstAverage,
      })),
      [{
        userId: goalieId,
        gamesPlayed: 0,
        wins: 0,
        losses: 0,
        ties: 0,
        shootoutLosses: 0,
        goalsAgainst: 0,
        shutouts: 0,
        goalsAgainstAverage: 0,
      }],
    );

    const selectedSeasonStats = await storage.getGoalieStats(leagueId, seasonId);
    assert.equal(selectedSeasonStats.length, 1);
    assert.equal(selectedSeasonStats[0].userId, goalieId);
    assert.equal(selectedSeasonStats[0].gamesPlayed, 0);
    assert.equal(selectedSeasonStats[0].goalsAgainstAverage, 0);
  } finally {
    await db.execute(sql`DELETE FROM league_memberships WHERE id = ${membershipId}`);
    await db.execute(sql`DELETE FROM seasons WHERE id = ${seasonId}`);
    await db.execute(sql`DELETE FROM leagues WHERE id = ${leagueId}`);
    await db.execute(sql`DELETE FROM users WHERE id = ${goalieId}`);
    await db.execute(sql`DELETE FROM users WHERE id = ${commissionerId}`);
  }
});