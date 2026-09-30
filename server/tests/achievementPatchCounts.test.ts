import { test } from 'node:test';
import assert from 'node:assert/strict';
import { achievementPatchCounts, earnedInSeason, type AchievementAward, type SeasonWindow } from '../achievementPatchCounts.js';

const windows: SeasonWindow[] = [
  { id: 'winter-2026', start: new Date('2026-09-06'), endExclusive: new Date('2027-01-25') },
];

function award(partial: Partial<AchievementAward> = {}): AchievementAward {
  return {
    userId: 'player', badgeDefinitionId: 'badge', tier: null,
    achievementType: 'onetime', triggerKey: null,
    scopeKey: 'global', count: 1, leagueId: null, seasonId: null,
    awardedAt: new Date('2026-09-25'),
    ...partial,
  };
}

test('counts seasonal achievements, but not legacy lifetime tiers awarded during the season', () => {
  const counts = achievementPatchCounts([
    award(),
    award({ triggerKey: 'calendar_year_beers', scopeKey: 'global:tier:bronze', tier: 'bronze' }),
    award({ triggerKey: 'calendar_year_beers', scopeKey: 'year:2026:tier:bronze', tier: 'bronze' }),
    award({ scopeKey: 'global:tier:bronze', tier: 'bronze' }),
    award({ badgeDefinitionId: 'old', awardedAt: new Date('2026-08-20') }),
    award({ badgeDefinitionId: 'future', awardedAt: new Date('2027-01-25') }),
    award({ badgeDefinitionId: 'other-league', leagueId: 'other' }),
    award({ badgeDefinitionId: 'other-season', scopeKey: 'season:winter-2025:tier:bronze' }),
    award({ badgeDefinitionId: 'season-2026', scopeKey: 'season:winter-2026:tier:bronze',
      awardedAt: new Date('2027-02-01') }),
  ], 'league', windows);
  assert.equal(counts.get('player'), 4); // current beer tier, career star, rookie, season-scoped tier
});

test('counts only new multiplier earnings since the previous snapshot', () => {
  const counts = achievementPatchCounts([
    award({ achievementType: 'multiplier', badgeDefinitionId: 'sub', scopeKey: 'global:count:5',
      count: 5, awardedAt: new Date('2026-08-20') }),
    award({ achievementType: 'multiplier', badgeDefinitionId: 'sub', scopeKey: 'global:count:8',
      count: 8, awardedAt: new Date('2026-10-01') }),
    award({ achievementType: 'multiplier', badgeDefinitionId: 'sub', scopeKey: 'global:count:10',
      count: 10, awardedAt: new Date('2027-02-01') }),
  ], 'league', windows);
  assert.equal(counts.get('player'), 3);
});

test('an unscoped achievement needs a dated season window; explicit scope does not', () => {
  const undated = [{ id: 'winter-2026', start: null, endExclusive: null }];
  assert.equal(earnedInSeason(award(), 'league', undated), false);
  assert.equal(earnedInSeason(award({ seasonId: 'winter-2026' }), 'league', undated), true);
});