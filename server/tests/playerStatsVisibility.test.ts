import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { activeTeamIds, sharesCurrentTeam } from '../playerStatsVisibility.js';

describe('Free player stats eligibility', () => {
  const league = 'league-a';
  const current = activeTeamIds([
    { id: 'team-now', leagueId: league, seasonIsActive: true },
    { id: 'team-before', leagueId: league, seasonIsActive: false },
    { id: 'team-old-tournament', leagueId: league, isInCompletedTournament: true },
    { id: 'team-other-league', leagueId: 'league-b' },
  ], league);

  test('keeps current teams but excludes former and unrelated teams', () => {
    assert.deepEqual(Array.from(current), ['team-now']);
    assert.equal(sharesCurrentTeam(current, activeTeamIds([
      { id: 'team-now', leagueId: league },
    ], league)), true);
    assert.equal(sharesCurrentTeam(current, activeTeamIds([
      { id: 'team-before', leagueId: league },
    ], league)), false);
    assert.equal(sharesCurrentTeam(current, new Set()), false);
  });

  test('supports league assignments and placeholder team IDs', () => {
    assert.deepEqual(Array.from(activeTeamIds([
      { id: 'assigned', leagueId: null, membershipLeagueId: league },
    ], league)), ['assigned']);
    assert.equal(current.has('team-now'), true); // placeholder_players.team_id
    assert.equal(current.has('opponent-team'), false);
  });

  test('unscoped links only accept currently shared teams', () => {
    const allCurrentTeams = activeTeamIds([
      { id: 'team-now', leagueId: league },
      { id: 'team-other-league', leagueId: 'league-b' },
    ]);
    assert.equal(sharesCurrentTeam(allCurrentTeams, new Set(['team-other-league'])), true);
    assert.equal(sharesCurrentTeam(allCurrentTeams, new Set(['opponent-team'])), false);
  });
});