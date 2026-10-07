import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { shiftDateKey } from "./trivia";

export type PatchStatsAward = {
  userId: string;
  badgeDefinitionId: string;
  tier: string | null;
  scopeKey: string;
  count: number;
  achievementType: string | null;
  awardedAt: Date;
};

export type PatchStatsWindow = { start: Date; endExclusive: Date };

export function seasonPatchWindow(input: {
  startDate: Date | null;
  endDate: Date | null;
  firstGame: Date | null;
  lastGame: Date | null;
  isActive: boolean;
  timezone: string;
}, now = new Date()): PatchStatsWindow | null {
  // Season form dates are calendar dates stored at UTC midnight. Game dates
  // are instants and must first be translated into the league's local day.
  const startDay = input.startDate
    ? input.startDate.toISOString().slice(0, 10)
    : input.firstGame ? formatInTimeZone(input.firstGame, input.timezone, "yyyy-MM-dd") : null;
  const endDay = input.endDate
    ? input.endDate.toISOString().slice(0, 10)
    : input.isActive ? formatInTimeZone(now, input.timezone, "yyyy-MM-dd")
      : input.lastGame ? formatInTimeZone(input.lastGame, input.timezone, "yyyy-MM-dd") : null;
  // An undated season with no schedule has no known earning period. Never
  // silently substitute the player's lifetime total for that season.
  if (!startDay || !endDay) return null;
  const start = fromZonedTime(`${startDay}T00:00:00`, input.timezone);
  const endExclusive = fromZonedTime(`${shiftDateKey(endDay, 1)}T00:00:00`, input.timezone);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(endExclusive.getTime()) || start >= endExclusive) {
    return null;
  }
  return { start, endExclusive };
}

/** Count awarded patches, not progress values or replayed announcement events. */
export function countSeasonPatches(
  awards: readonly PatchStatsAward[],
  window?: PatchStatsWindow,
): Map<string, number> {
  const totals = new Map<string, number>();
  const snapshots = new Map<string, { userId: string; before: number; through: number }>();
  for (const award of awards) {
    if (!Number.isFinite(award.awardedAt.getTime())) continue;
    if (window && award.awardedAt >= window.endExclusive) continue;
    const before = !!window && award.awardedAt < window.start;
    if (award.achievementType === "multiplier" && award.scopeKey.startsWith("global:count:")) {
      // Cumulative records are snapshots, e.g. 1 then 3 means two NEW patches,
      // not four. Keep the pre-season baseline even when querying a single season.
      const key = JSON.stringify([award.userId, award.badgeDefinitionId, award.tier]);
      const snapshot = snapshots.get(key) ?? { userId: award.userId, before: 0, through: 0 };
      const count = Math.max(1, award.count);
      snapshot.through = Math.max(snapshot.through, count);
      if (before) snapshot.before = Math.max(snapshot.before, count);
      snapshots.set(key, snapshot);
    } else if (!before) {
      // Each tier/scoped award is one patch, even if count stores a goal,
      // beer, trivia-answer or other progress metric.
      totals.set(award.userId, (totals.get(award.userId) ?? 0) + 1);
    }
  }
  for (const snapshot of Array.from(snapshots.values())) {
    totals.set(snapshot.userId, (totals.get(snapshot.userId) ?? 0) + snapshot.through - snapshot.before);
  }
  return totals;
}
