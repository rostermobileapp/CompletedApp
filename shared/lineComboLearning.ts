import type { ComboLineType } from "./lineComboPredictions";

export const LINE_COMBO_LEARNING_VERSION = "residual-pairs-v1" as const;
export type ScoredLineForecast = {
  gameId: string;
  lineType: ComboLineType;
  playerIds: string[];
  basePointsPerGame: number;
  actualPoints: number;
};
export type LineComboCalibration = {
  version: typeof LINE_COMBO_LEARNING_VERSION;
  available: boolean;
  evaluatedGames: number;
  groups: {
    lineType: ComboLineType;
    size: number;
    games: number;
    bias: number;
    pairs: { playerIds: string[]; games: number; bias: number }[];
  }[];
};
const pairsOf = (ids: string[]) => ids.flatMap((id, i) => ids.slice(i + 1).map(other => [id, other].sort()));
const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;

/**
 * Input is newest game first. Learn bounded, recency-weighted residuals against
 * the frozen PRE-GAME baseline, not today's player averages. Priors shrink the
 * general correction toward zero over 12 games and pair effects over 20 games.
 * Multiple lines in one game cannot masquerade as multiple independent games.
 */
export function learnLineComboCalibration(samples: ScoredLineForecast[], available = true): LineComboCalibration {
  const usable = samples.filter(s =>
    (s.lineType === "forward" || s.lineType === "defense") &&
    s.playerIds.length === (s.lineType === "forward" ? 3 : 2) &&
    new Set(s.playerIds).size === s.playerIds.length &&
    Number.isFinite(s.basePointsPerGame) && s.basePointsPerGame >= 0 &&
    Number.isFinite(s.actualPoints) && s.actualPoints >= 0);
  const gameIds = Array.from(new Set(usable.map(s => s.gameId))).slice(0, 60);
  const rank = new Map(gameIds.map((id, index) => [id, index]));
  const grouped = new Map<string, ScoredLineForecast[]>();
  for (const sample of usable) {
    if (!rank.has(sample.gameId)) continue;
    const key = `${sample.lineType}:${sample.playerIds.length}`;
    grouped.set(key, [...(grouped.get(key) ?? []), sample]);
  }
  const state: LineComboCalibration = {
    version: LINE_COMBO_LEARNING_VERSION, available, evaluatedGames: gameIds.length, groups: [],
  };
  for (const samples of Array.from(grouped.values())) {
    const errors = new Map<string, number[]>();
    const pairErrors = new Map<string, Map<string, number[]>>();
    // Deduplicate identical group/game samples, irrespective of slot or line number.
    const seen = new Set<string>();
    for (const sample of samples) {
      const ids = [...sample.playerIds].sort();
      const key = JSON.stringify([sample.gameId, ids]);
      if (seen.has(key)) continue;
      seen.add(key);
      const limit = Math.max(2, sample.basePointsPerGame * 0.75);
      const error = Math.max(-limit, Math.min(limit, sample.actualPoints - sample.basePointsPerGame));
      errors.set(sample.gameId, [...(errors.get(sample.gameId) ?? []), error]);
      for (const pair of pairsOf(ids)) {
        const pairKey = JSON.stringify(pair);
        const games = pairErrors.get(pairKey) ?? new Map<string, number[]>();
        games.set(sample.gameId, [...(games.get(sample.gameId) ?? []), error]);
        pairErrors.set(pairKey, games);
      }
    }
    const weight = (gameId: string) => 0.97 ** rank.get(gameId)!;
    const totalWeight = Array.from(errors.keys()).reduce((sum, id) => sum + weight(id), 0);
    const bias = Array.from(errors).reduce((sum, [id, values]) => sum + weight(id) * mean(values), 0) / (12 + totalWeight);
    state.groups.push({
      lineType: samples[0].lineType, size: samples[0].playerIds.length, games: errors.size, bias,
      pairs: Array.from(pairErrors).map(([key, games]) => ({
        playerIds: JSON.parse(key), games: games.size,
        bias: Array.from(games).reduce((sum, [id, values]) => sum + weight(id) * (mean(values) - bias), 0) /
          (20 + Array.from(games.keys()).reduce((sum, id) => sum + weight(id), 0)),
      })),
    });
  }
  return state;
}

export function applyLineComboCalibration(
  base: number, lineType: ComboLineType, ids: string[], state: LineComboCalibration,
) {
  const group = state.available && state.groups.find(g => g.lineType === lineType && g.size === ids.length);
  if (!group) return { pointsPerGame: base, tuningGames: 0 };
  const effects = pairsOf([...ids].sort()).map(pair =>
    group.pairs.find(p => p.playerIds[0] === pair[0] && p.playerIds[1] === pair[1])?.bias ?? 0);
  return {
    pointsPerGame: Math.max(0, base + group.bias + (effects.length ? mean(effects) : 0)),
    tuningGames: group.games,
  };
}
