import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { db } from '../db.js';
import { storage } from '../storage.js';

test('large league stats match approved Players across seasons without duplicates', async () => {
  const run = randomUUID().replace(/-/g, '');
  const leagueId = `test_${run}_league`;
  const commissionerId = `test_${run}_commissioner`;
  const teamId = `test_${run}_team`;
  const seasons = [`test_${run}_first`, `test_${run}_second`];
  const skaters = Array.from({ length: 51 }, (_, index) => `test_${run}_skater_${index}`);
  const goalieId = `test_${run}_goalie`;
  const pendingId = `test_${run}_pending`;
  const pendingGoalieId = `test_${run}_pending_goalie`;
  const placeholderSkaterId = `test_${run}_placeholder_skater`;
  const placeholderGoalieId = `test_${run}_placeholder_goalie`;
  const importId = `test_${run}_import`;
  const importedId = `test_${run}_historical`;
  const userIds = [commissionerId, ...skaters, goalieId, pendingId, pendingGoalieId];

  try {
    await db.execute(sql`INSERT INTO users
      (id, email, first_name, last_name, role, onboarding_completed, last_updated, created_at, updated_at, fee_exempt)
      VALUES ${sql.join(userIds.map((id, index) => sql`(
        ${id}, ${`stats_${run}_${index}@example.com`}, 'League', ${`Player ${index}`},
        'free_tier', false, NOW(), NOW(), NOW(), false
      )`), sql`, `)}`);
    await db.execute(sql`INSERT INTO leagues
      (id, name, unique_league_id, sport, commissioner_id, is_active,
       playoff_started, sub_approval_workflow, created_at, updated_at)
      VALUES (${leagueId}, 'Large Stats Test League', ${`Z${run.slice(0, 5)}`.toUpperCase()},
        'hockey', ${commissionerId}, true, false, 'captain_and_commissioner', NOW(), NOW())`);
    for (const [index, seasonId] of seasons.entries()) {
      await db.execute(sql`INSERT INTO seasons (id, name, league_id, is_active, created_at, updated_at)
        VALUES (${seasonId}, ${`Season ${index}`}, ${leagueId}, ${index === 1}, NOW(), NOW())`);
    }
    await db.execute(sql`INSERT INTO teams (id, name, league_id, season_id)
      VALUES (${teamId}, 'Roster Team', ${leagueId}, ${seasons[1]})`);
    await db.execute(sql`INSERT INTO league_memberships
      (user_id, league_id, status, is_goalie, is_skater, assigned_team_id)
      VALUES ${sql.join([
        ...skaters.map((id, index) => sql`(${id}, ${leagueId}, 'approved', false, true, ${index === 1 ? teamId : null})`),
        sql`(${goalieId}, ${leagueId}, 'approved', true, false, NULL)`,
        sql`(${pendingId}, ${leagueId}, 'pending', false, true, NULL)`,
        sql`(${pendingGoalieId}, ${leagueId}, 'pending', true, false, NULL)`,
      ], sql`, `)}`);
    await db.execute(sql`INSERT INTO team_memberships (user_id, team_id, status)
      VALUES (${skaters[1]}, ${teamId}, 'approved')`);
    await db.execute(sql`INSERT INTO placeholder_players
      (id, league_id, first_name, last_name, is_goalie, is_skater)
      VALUES (${placeholderSkaterId}, ${leagueId}, 'Zero', 'Skater', false, true),
             (${placeholderGoalieId}, ${leagueId}, 'Zero', 'Goalie', true, false)`);
    await db.execute(sql`INSERT INTO player_stats
      (user_id, league_id, season_id, games_played, goals, assists, penalty_minutes)
      VALUES (${skaters[2]}, ${leagueId}, ${seasons[0]}, 2, 3, 1, 4),
             (${skaters[2]}, ${leagueId}, ${seasons[1]}, 1, 0, 2, 0)`);

    const approvedPlayers = await storage.getLeagueMembers(leagueId);
    const placeholders = await storage.getLeaguePlaceholderPlayers(leagueId);
    assert.equal(approvedPlayers.length, 52);
    assert.equal(placeholders.length, 2);
    const expectedSkaters = new Set([...skaters, `placeholder:${placeholderSkaterId}`]);
    const expectedGoalies = new Set([goalieId, `placeholder:${placeholderGoalieId}`]);

    for (const seasonId of [...seasons, undefined]) {
      const skaterStats = await storage.getPlayerStats(leagueId, seasonId, 'non-goalies');
      const goalieStats = await storage.getGoalieStats(leagueId, seasonId);
      assert.deepEqual(new Set(skaterStats.map(stat => stat.userId)), expectedSkaters);
      assert.deepEqual(new Set(goalieStats.map(stat => stat.userId)), expectedGoalies);
      assert.equal(skaterStats.length, expectedSkaters.size);
      assert.equal(goalieStats.length, expectedGoalies.size);
      assert.equal(skaterStats.some(stat => stat.userId === pendingId), false);
      assert.equal(goalieStats.some(stat => stat.userId === pendingGoalieId), false);
      for (const id of [skaters[0], skaters[1], `placeholder:${placeholderSkaterId}`]) {
        const row = skaterStats.find(stat => stat.userId === id)!;
        assert.deepEqual(
          [row.gamesPlayed, row.goals, row.assists, row.penaltyMinutes, row.isGoalie],
          [0, 0, 0, 0, false],
        );
      }
      const scorer = skaterStats.find(stat => stat.userId === skaters[2])!;
      assert.deepEqual(
        [scorer.gamesPlayed, scorer.goals, scorer.assists, scorer.penaltyMinutes],
        seasonId === seasons[0] ? [2, 3, 1, 4]
          : seasonId === seasons[1] ? [1, 0, 2, 0] : [3, 3, 3, 4],
      );
    }

    // Imported historical records are retained even without an approved
    // registered membership, and have one row in the all-season response.
    await db.execute(sql`INSERT INTO player_imports
      (id, league_id, imported_by, file_name, total_records, successful_records, failed_records)
      VALUES (${importId}, ${leagueId}, ${commissionerId}, 'history.csv', 1, 1, 0)`);
    await db.execute(sql`INSERT INTO imported_players
      (id, import_id, league_id, first_name, last_name, position)
      VALUES (${importedId}, ${importId}, ${leagueId}, 'Historical', 'Skater', 'Skater')`);
    await db.execute(sql`INSERT INTO player_stats
      (imported_player_id, league_id, season_id, games_played, goals, assists, penalty_minutes)
      VALUES (${importedId}, ${leagueId}, ${seasons[0]}, 2, 1, 0, 0),
             (${importedId}, ${leagueId}, ${seasons[1]}, 1, 0, 1, 0)`);
    const historical = (await storage.getPlayerStats(leagueId, undefined, 'non-goalies'))
      .filter(stat => stat.importedPlayerId === importedId);
    assert.equal(historical.length, 1);
    assert.deepEqual([historical[0].gamesPlayed, historical[0].goals, historical[0].assists], [3, 1, 1]);
  } finally {
    await db.execute(sql`DELETE FROM player_stats WHERE league_id = ${leagueId}`);
    await db.execute(sql`DELETE FROM placeholder_players WHERE league_id = ${leagueId}`);
    await db.execute(sql`DELETE FROM imported_players WHERE id = ${importedId}`);
    await db.execute(sql`DELETE FROM player_imports WHERE id = ${importId}`);
    await db.execute(sql`DELETE FROM team_memberships WHERE team_id = ${teamId}`);
    await db.execute(sql`DELETE FROM league_memberships WHERE league_id = ${leagueId}`);
    await db.execute(sql`DELETE FROM teams WHERE id = ${teamId}`);
    await db.execute(sql`DELETE FROM seasons WHERE league_id = ${leagueId}`);
    await db.execute(sql`DELETE FROM leagues WHERE id = ${leagueId}`);
    await db.execute(sql`DELETE FROM users WHERE id IN (${sql.join(userIds.map(id => sql`${id}`), sql`, `)})`);
  }
});