export type AchievementAward = {
  userId: string;
  badgeDefinitionId: string;
  tier: string | null;
  achievementType: string | null;
  triggerKey: string | null;
  scopeKey: string;
  count: number;
  leagueId: string | null;
  seasonId: string | null;
  awardedAt: Date;
};

export type SeasonWindow = { id: string; start: Date | null; endExclusive: Date | null };

const RESETTING_TIER_TRIGGERS = new Set([
  'calendar_year_beers', 'calendar_year_appearances',
  'season_hat_tricks', 'season_scoring_streak',
]);

export function earnedInSeason(award: AchievementAward, leagueId: string, seasons: SeasonWindow[]): boolean {
  if (award.leagueId && award.leagueId !== leagueId) return false;
  // Lifetime tiers superseded by year/season-scoped versions are kept as
  // history in the Trophy Case; they aren't new seasonal patch earnings.
  if (award.scopeKey.startsWith('global:tier:') &&
      award.triggerKey && RESETTING_TIER_TRIGGERS.has(award.triggerKey)) return false;

  const scopedSeason = award.seasonId ?? /^season:([^:]+)/.exec(award.scopeKey)?.[1];
  if (scopedSeason) return seasons.some(season => season.id === scopedSeason);
  return seasons.some(season =>
    season.start !== null && season.endExclusive !== null &&
    award.awardedAt >= season.start && award.awardedAt < season.endExclusive);
}

// Cumulative multiplier rows are snapshots. For a season, count only the
// increase since the previous snapshot, not the full career count.
export function achievementPatchCounts(
  awards: AchievementAward[], leagueId: string, seasons: SeasonWindow[],
): Map<string, number> {
  const totals = new Map<string, number>();
  const previousSnapshots = new Map<string, number>();
  for (const award of [...awards].sort((a, b) => a.awardedAt.getTime() - b.awardedAt.getTime())) {
    if (award.achievementType === 'multiplier' && award.scopeKey.startsWith('global:count:')) {
      const key = `${award.userId}:${award.badgeDefinitionId}:${award.tier ?? ''}`;
      const previous = previousSnapshots.get(key) ?? 0;
      previousSnapshots.set(key, Math.max(previous, award.count));
      if (earnedInSeason(award, leagueId, seasons)) {
        totals.set(award.userId, (totals.get(award.userId) ?? 0) + Math.max(0, award.count - previous));
      }
    } else {
      if (!earnedInSeason(award, leagueId, seasons)) continue;
      const increment = award.achievementType === 'multiplier' ? Math.max(1, award.count) : 1;
      totals.set(award.userId, (totals.get(award.userId) ?? 0) + increment);
    }
  }
  return totals;
}